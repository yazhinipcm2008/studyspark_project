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

function generateQuizQuestionsLocally(sourceText: string, count: number, questionType: string, subject: string) {
  const questions: any[] = []
  const clean = sourceText.replace(/\r\n/g, '\n').trim()
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  for (let idx = 0; idx < count; idx++) {
    const line = lines[idx % lines.length] || `Core concept in ${subject}`
    
    if (questionType === 'true_false') {
      questions.push({
        question: `True or False: According to the study material, "${line.slice(0, 80)}" is an accurate statement?`,
        options: ['True', 'False'],
        correct_answer: 'True',
        explanation: line,
        topic: subject,
      })
    } else {
      const correct = line.length > 70 ? line.slice(0, 65) + '...' : line
      const options = [
        correct,
        'None of the defined operations or states apply.',
        'An asynchronous latch condition with inverted feedback.',
        'A high-impedance state without active logical transfer.',
      ].sort(() => 0.5 - Math.random())

      questions.push({
        question: `Which of the following correctly describes: "${line.slice(0, 60)}"?`,
        options,
        correct_answer: correct,
        explanation: line,
        topic: subject,
      })
    }
  }

  return questions
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
            system: `Generate ${numQuestions} ${questionType} quiz questions (${difficulty} difficulty). Output strictly JSON: {"questions": [{"question": "...", "options": ["..."], "correct_answer": "...", "explanation": "...", "topic": "..."}]}`,
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
