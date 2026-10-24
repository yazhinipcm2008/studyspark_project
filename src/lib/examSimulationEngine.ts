/**
 * Multi-material Exam Simulation Engine.
 * Synthesizes comprehensive, balanced exams drawn across multiple course materials.
 */

import { supabase } from '@/lib/supabase'
import { extractFlashcardsFromText } from '@/lib/aiFallback'
import type { Material, QuizQuestion } from '@/types/database'

export interface ExamSimulationQuestion {
  id: string
  position: number
  question_text: string
  options: string[]
  correct_answer: string
  topic: string
  material_id: string
  material_title: string
  explanation: string
  source_passage?: string | null
  source_page?: number | null
}

export interface GenerateExamParams {
  userId: string
  materialIds: string[]
  totalQuestions: number
  difficulty?: 'easy' | 'medium' | 'hard'
  title?: string
}

export async function generateMultiMaterialExam(params: GenerateExamParams): Promise<{
  title: string
  questions: ExamSimulationQuestion[]
  materials: Material[]
}> {
  const { userId, materialIds, totalQuestions, title } = params

  if (!materialIds || materialIds.length === 0) {
    throw new Error('Please select at least one study material for the exam simulation.')
  }

  // 1. Fetch the target materials
  const { data: materials, error: matErr } = await supabase
    .from('materials')
    .select('*')
    .in('id', materialIds)
    .eq('user_id', userId)

  if (matErr || !materials || materials.length === 0) {
    throw new Error('Could not find selected study materials.')
  }

  const examTitle = title || (
    materials.length === 1
      ? `Comprehensive Exam: ${materials[0].title}`
      : `Multi-Material Simulation (${materials.length} Subjects)`
  )

  const candidateQuestions: ExamSimulationQuestion[] = []

  // 2. Try fetching existing curated questions for these materials
  try {
    const { data: existingQuizzes } = await supabase
      .from('quizzes')
      .select('id, material_id')
      .in('material_id', materialIds)

    if (existingQuizzes && existingQuizzes.length > 0) {
      const quizIds = existingQuizzes.map(q => q.id)
      const { data: existingQuestions } = await supabase
        .from('quiz_questions')
        .select('*')
        .in('quiz_id', quizIds)

      if (existingQuestions && existingQuestions.length > 0) {
        existingQuestions.forEach(eq => {
          const matchedMat = materials.find(m => m.id === eq.material_id) || materials[0]
          candidateQuestions.push({
            id: eq.id || crypto.randomUUID(),
            position: 0,
            question_text: eq.question_text,
            options: eq.options || [],
            correct_answer: eq.correct_answer,
            topic: eq.topic || matchedMat.subject || 'General',
            material_id: matchedMat.id,
            material_title: matchedMat.title,
            explanation: eq.explanation || eq.correct_answer,
            source_passage: eq.source_passage || null,
            source_page: eq.source_page || 1,
          })
        })
      }
    }
  } catch (err) {
    console.warn('Could not query existing questions pool:', err)
  }

  // 3. For any material needing more questions, generate fresh ones from extracted_text
  const questionsPerMaterial = Math.ceil(totalQuestions / materials.length)

  for (const mat of materials) {
    const existingCountForMat = candidateQuestions.filter(q => q.material_id === mat.id).length
    const needed = Math.max(3, questionsPerMaterial - existingCountForMat)

    if (mat.extracted_text && mat.extracted_text.length >= 20) {
      const cards = extractFlashcardsFromText(mat.extracted_text, needed, mat.subject || 'General')

      cards.forEach((card, idx) => {
        // Derive page and passage
        let sourcePage = 1
        let sourcePassage = card.back
        const searchNeedle = card.back.length > 20 ? card.back.slice(0, 30) : card.back
        const charIdx = mat.extracted_text!.indexOf(searchNeedle)
        if (charIdx !== -1) {
          const textBefore = mat.extracted_text!.slice(0, charIdx)
          const pageMatches = [...textBefore.matchAll(/\[Page\s*(\d+)\]/gi)]
          sourcePage = pageMatches.length > 0
            ? parseInt(pageMatches[pageMatches.length - 1][1], 10)
            : Math.floor(charIdx / 1800) + 1
          sourcePassage = mat.extracted_text!.slice(Math.max(0, charIdx - 20), charIdx + 150).trim()
        }

        const correctOption = card.back.length > 90 ? card.back.slice(0, 85) + '...' : card.back
        const distractors = [
          'None of the above parameters apply.',
          'An asynchronous clock latch without sequential register hold.',
          'An inverted feedback condition under zero electrical potential.',
          'A standard non-blocking operational transfer.',
        ]
        const allOptions = [correctOption, ...distractors.slice(0, 3)].sort(() => 0.5 - Math.random())

        candidateQuestions.push({
          id: `gen-${mat.id}-${idx}-${Date.now()}`,
          position: 0,
          question_text: card.front,
          options: allOptions,
          correct_answer: correctOption,
          topic: card.topic || mat.subject || 'General',
          material_id: mat.id,
          material_title: mat.title,
          explanation: card.back,
          source_passage: sourcePassage,
          source_page: sourcePage,
        })
      })
    }
  }

  if (candidateQuestions.length === 0) {
    throw new Error('Selected materials have insufficient text notes to generate an exam simulation.')
  }

  // 4. Shuffle and take exact requested totalQuestions
  const shuffled = candidateQuestions.sort(() => 0.5 - Math.random())
  const finalQuestions = shuffled.slice(0, totalQuestions).map((q, idx) => ({
    ...q,
    position: idx + 1,
  }))

  return {
    title: examTitle,
    questions: finalQuestions,
    materials,
  }
}
