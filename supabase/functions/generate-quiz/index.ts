import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

async function authenticateUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await client.auth.getUser(token)

  if (error || !user) {
    throw new Error('Invalid or expired session token')
  }

  return { user, supabase: client }
}

interface QuizQuestionItem {
  question: string
  options: string[]
  correct_answer: string
  explanation: string
  topic: string
}

const BOGUS_PATTERNS = [
  /high-impedance/i,
  /asynchronous\s+(?:latch|clock|condition)/i,
  /inverted\s+feedback/i,
  /None of the\s+(?:defined|above|parameters)/i,
  /standard\s+non-blocking/i,
  /sequential\s+latch/i,
]

function sanitizeAndRefineQuestion(q: any, subject: string, allAnswers: string[]): QuizQuestionItem {
  let question = (q.question || q.question_text || '').trim()
  let correct = (q.correct_answer || '').trim()

  // 1. Detect if question quotes a raw line or formula
  const quoteMatch = question.match(
    /(?:Which of the following (?:correctly )?describes|Explain the concept|Define or explain):\s*["']?([^"']+)["']?\??/i
  )

  if (quoteMatch && quoteMatch[1]) {
    const raw = quoteMatch[1].trim()
    if (raw.includes(':')) {
      const parts = raw.split(':')
      const term = parts[0].trim()
      const detail = parts.slice(1).join(':').trim()

      if (detail.includes('->')) {
        question = `In ${subject}, what is the correct stage execution sequence for "${term}"?`
        correct = detail.replace(/\s*\.\.\.\s*$/, '').trim()
      } else {
        question = `What is the primary role or definition of "${term}"?`
        correct = detail.replace(/\s*\.\.\.\s*$/, '').trim()
      }
    } else if (raw.includes('->')) {
      question = `What is the correct sequential order of stages for instruction execution in ${subject}?`
      correct = raw.replace(/\s*\.\.\.\s*$/, '').trim()
    } else {
      question = `Which of the following statements accurately characterizes "${raw.slice(0, 55)}"?`
    }
  } else if (question.startsWith('What is ') && question.includes(':')) {
    const parts = question.replace(/^What is /i, '').split(':')
    question = `What is the primary definition or function of "${parts[0].trim()}"?`
    if (parts[1]) {
      correct = parts.slice(1).join(':').replace(/\s*\.\.\.\s*$/, '').trim()
    }
  }

  // 2. Clean correct answer if it redundantly includes 'Term: ...'
  if (correct.includes(':') && !correct.slice(0, 25).includes('->')) {
    const parts = correct.split(':')
    if (parts[0].length < 35 && parts[1].length > 5) {
      correct = parts.slice(1).join(':').trim()
    }
  }
  correct = correct.replace(/\s*\.\.\.\s*$/, '').trim()
  if (correct.length > 115) {
    correct = correct.slice(0, 110) + '...'
  }

  // 3. Purge bogus distractors
  const options: string[] = [correct]

  for (const opt of q.options || []) {
    const cleanOpt = opt.replace(/\s*\.\.\.\s*$/, '').trim()
    const isBogus = BOGUS_PATTERNS.some(p => p.test(cleanOpt))
    if (!isBogus && cleanOpt && cleanOpt !== correct && !options.includes(cleanOpt)) {
      options.push(cleanOpt.length > 115 ? cleanOpt.slice(0, 110) + '...' : cleanOpt)
    }
  }

  // If answer is stage sequence (arrows), add realistic stage permutations
  if (correct.includes('->')) {
    const stageVariants = [
      'I1 -> ID -> IF -> MEM -> EX',
      'I1 -> IF -> EX -> ID -> MEM',
      'I1 -> IF -> ID -> MEM -> EX',
      'I1 -> MEM -> IF -> ID -> EX',
    ]
    for (const v of stageVariants) {
      if (options.length < 4 && !options.includes(v) && v !== correct) {
        options.push(v)
      }
    }
  }

  // Distractors from other questions in this set
  for (const other of allAnswers) {
    if (options.length < 4 && other !== correct && !options.includes(other) && other.length > 5) {
      options.push(other.length > 115 ? other.slice(0, 110) + '...' : other)
    }
  }

  // Academic domain fallbacks
  const academicFallbacks = [
    'Executes instruction cycles serially without overlapping functional hardware stages.',
    'Increases total instruction throughput while individual stage latency remains fixed.',
    'Eliminates structural hazards by dynamic speculative register re-allocation.',
    'Introduces stall cycles whenever branch target address is unresolved.',
  ]
  for (const af of academicFallbacks) {
    if (options.length < 4 && !options.includes(af) && af !== correct) {
      options.push(af)
    }
  }

  return {
    question,
    options: options.slice(0, 4).sort(() => 0.5 - Math.random()),
    correct_answer: correct,
    explanation: q.explanation || `Core concept in ${subject}: ${correct}`,
    topic: q.topic || subject,
  }
}

function generateQuizQuestionsLocally(sourceText: string, count: number, questionType: string, subject: string): QuizQuestionItem[] {
  const clean = sourceText.replace(/\r\n/g, '\n').trim()
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  interface ConceptPair {
    term: string
    definition: string
    isArrow: boolean
  }

  const concepts: ConceptPair[] = []

  // Extract structured concepts:
  for (const line of lines) {
    // 1. Colon pattern: 'Term: Definition' or 'Without pipelining: ...'
    const colonMatch = line.match(/^([•\-\*]?\s*)([^:]{2,55})\s*:\s*(.+)$/i)
    if (colonMatch && colonMatch[2] && colonMatch[3]) {
      const term = colonMatch[2].replace(/^[•\-\*]\s*/, '').trim()
      const def = colonMatch[3].trim()
      if (term.length >= 2 && def.length >= 4) {
        concepts.push({
          term,
          definition: def,
          isArrow: def.includes('->'),
        })
        continue
      }
    }

    // 2. Definition sentences: 'X is/are Y'
    if (/\s+(?:is|are|was|were)\s+/i.test(line) && line.length < 250) {
      const parts = line.split(/\s+(?:is|are|was|were)\s+/i)
      if (parts.length >= 2 && parts[0].length < 45 && parts[1].length > 10) {
        const term = parts[0].replace(/^[•\-\*]\s*/, '').trim()
        concepts.push({
          term,
          definition: parts.slice(1).join(' is/are ').trim(),
          isArrow: false,
        })
        continue
      }
    }

    // 3. Arrow pipelines on their own line
    if (line.includes('->') && line.length < 150) {
      concepts.push({
        term: subject || 'Pipeline Stage Sequence',
        definition: line,
        isArrow: true,
      })
    }
  }

  // Fallback to meaningful lines if no explicit definitions were matched
  if (concepts.length === 0) {
    for (const line of lines) {
      if (line.length > 15 && line.length < 200) {
        concepts.push({
          term: line.slice(0, 35),
          definition: line,
          isArrow: line.includes('->'),
        })
      }
    }
  }

  if (concepts.length === 0) {
    concepts.push({
      term: subject,
      definition: `Fundamental concept and operational workflow of ${subject}`,
      isArrow: false,
    })
  }

  const allAnswers = concepts.map(c => {
    let d = c.definition.trim()
    if (d.includes(':') && !d.includes('->')) {
      const sp = d.split(':')
      if (sp[0].length < 35 && sp[1].length > 5) d = sp[1].trim()
    }
    return d.length > 105 ? d.slice(0, 100) + '...' : d
  })

  const rawQuestions: any[] = []

  for (let idx = 0; idx < count; idx++) {
    const concept = concepts[idx % concepts.length]
    let cleanDef = concept.definition.trim()
    if (cleanDef.includes(':') && !cleanDef.includes('->')) {
      const sp = cleanDef.split(':')
      if (sp[0].length < 35 && sp[1].length > 5) cleanDef = sp[1].trim()
    }
    const correctAns = cleanDef.length > 105 ? cleanDef.slice(0, 100) + '...' : cleanDef

    if (questionType === 'true_false') {
      const isTrue = idx % 2 === 0
      const prompt = isTrue
        ? `In ${subject}, is it accurate that "${concept.term}" involves: ${correctAns}?`
        : `In ${subject}, is it accurate that "${concept.term}" operates by completely bypassing sequential hardware stages without clock coordination?`

      rawQuestions.push({
        question: prompt,
        options: ['True', 'False'],
        correct_answer: isTrue ? 'True' : 'False',
        explanation: concept.definition,
        topic: subject,
      })
    } else {
      let qPrompt = ''
      if (concept.isArrow) {
        qPrompt = `In ${subject}, what is the correct stage execution sequence for "${concept.term}"?`
      } else {
        qPrompt = `What is the primary definition or function of "${concept.term}"?`
      }

      const distractors = allAnswers.filter(a => a !== correctAns && a.length > 5)
      const chosenDistractors: string[] = []
      for (const d of distractors) {
        if (chosenDistractors.length < 3 && !chosenDistractors.includes(d)) {
          chosenDistractors.push(d)
        }
      }

      rawQuestions.push({
        question: qPrompt,
        options: [correctAns, ...chosenDistractors],
        correct_answer: correctAns,
        explanation: concept.definition,
        topic: subject,
      })
    }
  }

  return rawQuestions.map(q => sanitizeAndRefineQuestion(q, subject, allAnswers))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, supabase } = await authenticateUser(req)
    const body = await req.json()

    let sourceText = body.raw_text || ''
    let quizSubject = body.subject || 'General Studies'
    let quizTitle = body.title || `Quiz on ${quizSubject}`
    const numQuestions = Number(body.num_questions) || 5
    const difficulty = body.difficulty || 'medium'
    const questionType = body.question_type || 'multiple_choice'

    if (body.material_id) {
      const { data: material } = await supabase
        .from('materials')
        .select('*')
        .eq('id', body.material_id)
        .eq('user_id', user.id)
        .single()

      if (material) {
        sourceText = material.extracted_text || ''
        quizSubject = material.subject || quizSubject
        quizTitle = body.title || `Quiz: ${material.title}`
      }
    }

    if (!sourceText || sourceText.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Please provide at least 10 characters of text.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let questions: any[] = []
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (apiKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: Deno.env.get('CLAUDE_MODEL') || 'claude-3-5-sonnet-20241022',
            max_tokens: 3500,
            temperature: 0.2,
            system: `Generate ${numQuestions} academic ${questionType} quiz questions (${difficulty} difficulty). Ensure clear, natural question prompts, concise answers, and realistic academic distractors. Output strictly JSON: {"questions": [{"question": "...", "options": ["..."], "correct_answer": "...", "explanation": "...", "topic": "..."}]}`,
            messages: [{ role: 'user', content: sourceText.slice(0, 30000) }],
          }),
        })

        if (response.ok) {
          const resData = await response.json()
          const raw = resData.content?.[0]?.text || ''
          const match = raw.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (Array.isArray(parsed.questions)) questions = parsed.questions
          }
        }
      } catch (e) {
        console.warn('Claude API error in quiz, using local fallback:', e)
      }
    }

    if (questions.length === 0) {
      questions = generateQuizQuestionsLocally(sourceText, numQuestions, questionType, quizSubject)
    } else {
      const allAns = questions.map((q: any) => q.correct_answer || '').filter(Boolean)
      questions = questions.map((q: any) => sanitizeAndRefineQuestion(q, quizSubject, allAns))
    }

    let quizId = crypto.randomUUID()
    let persisted = false

    try {
      const { data: quizRecord, error: qErr } = await supabase
        .from('quizzes')
        .insert({
          user_id: user.id,
          material_id: body.material_id || null,
          title: quizTitle,
          difficulty,
          question_type: questionType,
          num_questions: questions.length,
          subject: quizSubject,
        })
        .select()
        .single()

      if (!qErr && quizRecord) {
        quizId = quizRecord.id
        const questionsPayload = questions.map((q: any, idx: number) => ({
          quiz_id: quizRecord.id,
          user_id: user.id,
          position: idx + 1,
          question_text: q.question,
          question_type: questionType,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation || '',
          topic: q.topic || quizSubject,
        }))

        await supabase.from('quiz_questions').insert(questionsPayload)
        persisted = true
      }
    } catch (e) {
      console.warn('Remote database insert skipped for quiz:', e)
    }

    return new Response(JSON.stringify({
      quiz_id: quizId,
      title: quizTitle,
      num_questions: questions.length,
      questions,
      persisted_to_remote: persisted,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Failed to generate quiz' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
