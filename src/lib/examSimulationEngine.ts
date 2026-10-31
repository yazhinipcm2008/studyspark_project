import { sanitizeQuestions } from '@/lib/questionSanitizer'
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

        // Formulate clear, natural question text
        let questionText = card.front
        if (questionText.startsWith('Explain the concept: "') || questionText.startsWith('Which of the following correctly describes: "')) {
          const match = questionText.match(/["']([^"']+)["']/)
          if (match) {
            const raw = match[1]
            if (raw.includes(':')) {
              const parts = raw.split(':')
              questionText = `What is the primary role or definition of "${parts[0].trim()}"?`
            } else {
              questionText = `Which of the following statements accurately characterizes "${raw.slice(0, 55)}"?`
            }
          }
        } else if (questionText.startsWith('What is ')) {
          const term = questionText.replace(/^What is /i, '').replace(/[?]$/, '').trim()
          questionText = `In ${mat.subject || 'this subject'}, what is the definition or primary characteristic of "${term}"?`
        }

        // Clean correct answer
        let cleanAnswer = card.back.trim()
        // If answer redundantly repeats "Term: ...", strip the duplicate prefix
        const colonSplit = cleanAnswer.split(/^[^:]{2,35}:\s*/)
        if (colonSplit.length > 1 && colonSplit[1].length > 5) {
          cleanAnswer = colonSplit[1].trim()
        }
        const correctOption = cleanAnswer.length > 110 ? cleanAnswer.slice(0, 105) + '...' : cleanAnswer

        // Context-aware distractors from OTHER cards in the same material!
        const otherAnswers = cards
          .filter((_, oIdx) => oIdx !== idx)
          .map(c => {
            const cs = c.back.trim().split(/^[^:]{2,35}:\s*/)
            return cs.length > 1 && cs[1].length > 5 ? cs[1].trim() : c.back.trim()
          })
          .filter(b => b.length > 10 && b !== cleanAnswer)

        const selectedDistractors: string[] = []
        const shuffledOthers = [...otherAnswers].sort(() => 0.5 - Math.random())

        shuffledOthers.forEach(ans => {
          if (selectedDistractors.length < 3) {
            const shortAns = ans.length > 110 ? ans.slice(0, 105) + '...' : ans
            if (!selectedDistractors.includes(shortAns) && shortAns !== correctOption) {
              selectedDistractors.push(shortAns)
            }
          }
        })

        // Realistic academic fallback distractors if insufficient material items exist
        const smartDomainDistractors = [
          'Executes all instruction stages strictly sequentially without overlapping cycles.',
          'Increases total instruction latency while keeping system clock frequency constant.',
          'Requires complete register file write-back before the next fetch cycle can begin.',
          'Reduces memory bus bandwidth by forcing synchronous single-issue execution.',
          'Bypasses the decode stage using direct microcode branch prediction.'
        ]

        smartDomainDistractors.forEach(d => {
          if (selectedDistractors.length < 3 && !selectedDistractors.includes(d) && d !== correctOption) {
            selectedDistractors.push(d)
          }
        })

        const allOptions = [correctOption, ...selectedDistractors.slice(0, 3)].sort(() => 0.5 - Math.random())

        candidateQuestions.push({
          id: `gen-${mat.id}-${idx}-${Date.now()}`,
          position: 0,
          question_text: questionText,
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
  const finalQuestions = sanitizeQuestions(shuffled.slice(0, totalQuestions)).map((q, idx) => ({
    ...q,
    position: idx + 1,
  }))

  return {
    title: examTitle,
    questions: finalQuestions,
    materials,
  }
}
