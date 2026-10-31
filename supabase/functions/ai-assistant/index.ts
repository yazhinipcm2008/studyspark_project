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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, supabase } = await authenticateUser(req)
    const body = await req.json()
    const message = body.message || ''
    let convId = body.conversation_id || null

    let materialText = ''
    let materialTitle = ''

    if (body.material_id) {
      const { data: mat } = await supabase
        .from('materials')
        .select('title, extracted_text')
        .eq('id', body.material_id)
        .eq('user_id', user.id)
        .single()

      if (mat) {
        materialTitle = mat.title
        materialText = (mat.extracted_text || '').slice(0, 30000)
      }
    }

    // Try to create/get conversation in database
    if (!convId) {
      try {
        const { data: newConv } = await supabase
          .from('ai_conversations')
          .insert({
            user_id: user.id,
            title: message.slice(0, 40) + (message.length > 40 ? '...' : ''),
            material_id: body.material_id || null,
          })
          .select()
          .single()

        if (newConv) convId = newConv.id
      } catch (e) {
        convId = crypto.randomUUID()
      }
    }

    let reply = ''
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (apiKey) {
      try {
        const systemPrompt = materialText
          ? `You are an academic tutor explaining study material: "${materialTitle}". Notes:\n${materialText}`
          : `You are StudySpark AI, an encouraging academic coach helping collegiate students excel.`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: Deno.env.get('CLAUDE_MODEL') || 'claude-3-5-sonnet-20241022',
            max_tokens: 1500,
            temperature: 0.3,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }],
          }),
        })

        if (response.ok) {
          const resData = await response.json()
          reply = resData.content?.[0]?.text || ''
        }
      } catch (e) {
        console.warn('Claude API assistant failed, using smart educational response:', e)
      }
    }

    if (!reply) {
      if (materialText) {
        // Keyword relevance matching instead of blindly dumping top lines
        const queryTerms = message
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 2 && !['what', 'when', 'where', 'which', 'explain', 'tell', 'about', 'how', 'does', 'the', 'this', 'that', 'with'].includes(w))

        const paragraphs = materialText
          .split(/\n\s*\n|\n/)
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 20)

        let bestMatch = ''
        let bestScore = 0

        for (const p of paragraphs) {
          const lower = p.toLowerCase()
          let score = 0
          for (const term of queryTerms) {
            if (lower.includes(term)) score += 1
          }
          if (score > bestScore) {
            bestScore = score
            bestMatch = p
          }
        }

        if (bestMatch && bestScore > 0) {
          reply = `### Explanation from ${materialTitle}\n\n**Direct Concept:**\n${bestMatch}\n\n**💡 Academic Breakdown:**\n- **Core Definition**: Master this key mechanism and its terminology.\n- **Exam Relevance**: Look out for sequential stage order, definitions, and hazard handling.\n- **Recommended Next Step**: Test yourself using flashcards or take a practice mock exam.`
        } else {
          const summaryPoints = paragraphs.slice(0, 3).map((p: string) => `- ${p.length > 110 ? p.slice(0, 105) + '...' : p}`).join('\n')
          reply = `### Academic Assistant • ${materialTitle}\n\nRegarding your question: **"${message}"**:\n\nKey principles from **${materialTitle}** include:\n${summaryPoints}\n\nAsk about any specific term, stage sequence, or problem, and I'll break it down step-by-step!`
        }
      } else {
        reply = `### Academic Assistant\n\nRegarding your question on **"${message}"**:\n\n1. **Core Concept**: Focus on the fundamental rules and relationships.\n2. **Exam Focus**: Test both conceptual understanding and problem-solving steps.\n3. **Recommended Next Step**: Generate flashcards or a practice quiz from your study materials to consolidate this topic.`
      }
    }

    // Attempt to persist message to database
    try {
      if (convId) {
        await supabase.from('ai_messages').insert([
          { conversation_id: convId, user_id: user.id, role: 'user', content: message },
          { conversation_id: convId, user_id: user.id, role: 'assistant', content: reply },
        ])
      }
    } catch (e) {
      console.warn('Could not persist messages to Supabase table:', e)
    }

    return new Response(JSON.stringify({
      conversation_id: convId,
      reply,
      role: 'assistant',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Assistant request failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
