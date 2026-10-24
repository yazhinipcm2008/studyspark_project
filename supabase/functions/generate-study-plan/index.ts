import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

// 1. CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// 2. Authentication Helper
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

// 3. Spaced Repetition Task Generator
function generateTasks(input: any, todayStr: string, lastExamDate: string) {
  const tasks: any[] = []
  const today = new Date(todayStr)
  const lastExam = new Date(lastExamDate)
  const diffTime = Math.max(0, lastExam.getTime() - today.getTime())
  const daysDiff = Math.min(30, Math.max(3, Math.ceil(diffTime / (1000 * 60 * 60 * 24))))

  const subjects = Array.isArray(input.subjects) ? input.subjects : ['General Studies']
  const sessionLength = Number(input.session_length_minutes) || 45

  const importantList = input.important_topics
    ? String(input.important_topics).split(',').map((t: string) => t.trim()).filter(Boolean)
    : []

  for (let i = 0; i < daysDiff; i++) {
    const curDate = new Date(today)
    curDate.setDate(today.getDate() + i)
    const dateStr = curDate.toISOString().split('T')[0]
    const subject = subjects[i % subjects.length]

    const topic = importantList.length > 0
      ? importantList[i % importantList.length]
      : `${subject} Core Fundamentals & Problem Solving`

    const isNearExam = Array.isArray(input.exam_dates) && input.exam_dates.some((ed: any) => {
      const examTime = new Date(ed.date).getTime()
      const currTime = curDate.getTime()
      const daysUntil = (examTime - currTime) / (1000 * 60 * 60 * 24)
      return ed.subject === subject && daysUntil >= 0 && daysUntil <= 3
    })

    const taskType = isNearExam
      ? (i % 2 === 0 ? 'revision' : 'practice')
      : (i % 3 === 0 ? 'practice' : (i % 2 === 0 ? 'revision' : 'study'))

    tasks.push({
      date: dateStr,
      subject,
      topic,
      task_type: taskType,
      duration_minutes: sessionLength,
      priority: isNearExam || i < 3 ? 'high' : 'medium',
      notes: isNearExam ? `High priority final revision before ${subject} exam` : `Structured study session for ${subject}`,
    })
  }

  return tasks
}

// 4. Main Request Handler
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, supabase } = await authenticateUser(req)
    const input = await req.json()

    const subjects = input.subjects && input.subjects.length > 0 ? input.subjects : ['General Studies']
    const todayStr = new Date().toISOString().split('T')[0]

    let lastExamDate = todayStr
    if (Array.isArray(input.exam_dates) && input.exam_dates.length > 0) {
      const sorted = [...input.exam_dates].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
      lastExamDate = sorted[sorted.length - 1].date
    }

    // Attempt AI Generation if ANTHROPIC_API_KEY is configured
    let tasks: any[] = []
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
            max_tokens: 3000,
            temperature: 0.2,
            system: `You are an academic planner. Create structured study tasks between ${todayStr} and ${lastExamDate}. Output strictly JSON: {"tasks": [{"date": "YYYY-MM-DD", "subject": "...", "topic": "...", "task_type": "study"|"revision"|"practice", "duration_minutes": 45, "priority": "low"|"medium"|"high", "notes": "..."}]}`,
            messages: [{ role: 'user', content: `Subjects: ${subjects.join(', ')}. Exams: ${JSON.stringify(input.exam_dates)}` }],
          }),
        })

        if (response.ok) {
          const resData = await response.json()
          const raw = resData.content?.[0]?.text || ''
          const match = raw.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (Array.isArray(parsed.tasks)) tasks = parsed.tasks
          }
        }
      } catch (aiErr) {
        console.warn('Claude API call skipped, using algorithmic scheduler:', aiErr)
      }
    }

    // Default to built-in smart scheduler
    if (tasks.length === 0) {
      tasks = generateTasks(input, todayStr, lastExamDate)
    }

    // Persist to Supabase database if tables exist
    let planId = crypto.randomUUID()
    let persistedToRemote = false

    try {
      const { data: planRecord, error: planErr } = await supabase
        .from('study_plans')
        .insert({
          user_id: user.id,
          title: input.title || 'Semester Study Plan',
          start_date: todayStr,
          end_date: lastExamDate,
          config: input,
        })
        .select()
        .single()

      if (!planErr && planRecord) {
        planId = planRecord.id
        const tasksToInsert = tasks.map((t: any) => ({
          plan_id: planRecord.id,
          user_id: user.id,
          subject: t.subject,
          topic: t.topic,
          task_type: t.task_type || 'study',
          scheduled_date: t.date,
          duration_minutes: t.duration_minutes || 45,
          priority: t.priority || 'medium',
          notes: t.notes || '',
          completed: false,
        }))

        await supabase.from('study_tasks').insert(tasksToInsert)
        persistedToRemote = true
      }
    } catch (dbErr) {
      console.warn('Database table study_plans not yet created, returning tasks directly:', dbErr)
    }

    return new Response(JSON.stringify({
      plan_id: planId,
      title: input.title || 'Semester Study Plan',
      task_count: tasks.length,
      tasks,
      has_weak_topics_weighted: false,
      weak_topics_count: 0,
      persisted_to_remote: persistedToRemote,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error processing request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
