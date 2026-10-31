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

function extractFlashcardsLocally(text: string, count: number, defaultTopic: string) {
  const cards: Array<{ front: string; back: string; topic: string }> = []
  const clean = text.replace(/\r\n/g, '\n').trim()
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (cards.length >= count) break

    // Colon match: "Term: Definition" or "Pipeline Stages: IF, ID, EX..."
    const colonMatch = line.match(/^([•\-\*]?\s*)([^:]{2,50})\s*:\s*(.+)$/i)
    if (colonMatch && colonMatch[2] && colonMatch[3]) {
      const term = colonMatch[2].replace(/^[•\-\*]\s*/, '').trim()
      let def = colonMatch[3].trim()

      if (term.length > 1 && def.length > 4) {
        if (def.includes('->')) {
          cards.push({
            front: `What is the execution stage sequence for "${term}"?`,
            back: def,
            topic: defaultTopic,
          })
        } else {
          cards.push({
            front: `What is the definition or role of "${term}"?`,
            back: def,
            topic: defaultTopic,
          })
        }

        if (term.includes('⊕') || term.includes('+') || term.includes('·')) {
          cards.push({
            front: `What Boolean operation does the symbol '⊕' represent?`,
            back: `Exclusive-OR (XOR), a standard combinational operator.`,
            topic: 'Boolean Operations',
          })
          cards.push({
            front: `What Boolean operation does the symbol '·' represent?`,
            back: `Logical Product (AND), a standard combinational operator.`,
            topic: 'Boolean Operations',
          })
        }
      }
      continue
    }

    // Sentence matching: "X is/are Y"
    if (/\s+(?:is|are|was|were)\s+/i.test(line) && line.length < 220) {
      const parts = line.split(/\s+(?:is|are|was|were)\s+/i)
      if (parts.length >= 2 && parts[0].length < 45 && parts[1].length > 10) {
        const term = parts[0].replace(/^[•\-\*]\s*/, '').trim()
        cards.push({
          front: `Define or describe: ${term}`,
          back: line,
          topic: defaultTopic,
        })
      }
    }
  }

  // Fallback to key concepts if count not reached
  if (cards.length < count) {
    const sentences = clean.split(/[.?!]\s+/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 250)
    for (const sentence of sentences) {
      if (cards.length >= count) break
      const firstWords = sentence.split(' ').slice(0, 5).join(' ')
      cards.push({
        front: `Key Concept: ${firstWords}...`,
        back: sentence,
        topic: defaultTopic,
      })
    }
  }

  let padIdx = 1
  while (cards.length < count) {
    const line = lines[(padIdx - 1) % lines.length] || `Principle ${padIdx} of ${defaultTopic}`
    cards.push({
      front: `Core Principle: ${line.slice(0, 45)}${line.length > 45 ? '...' : ''}`,
      back: line,
      topic: defaultTopic,
    })
    padIdx++
  }

  return cards.slice(0, count)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, supabase } = await authenticateUser(req)
    const body = await req.json()

    let sourceText = body.raw_text || ''
    let setTitle = body.title || 'Flashcard Deck'
    let subject = body.subject || 'General Studies'
    const count = Number(body.count) || 10

    if (body.material_id) {
      const { data: material } = await supabase
        .from('materials')
        .select('*')
        .eq('id', body.material_id)
        .eq('user_id', user.id)
        .single()

      if (material) {
        sourceText = material.extracted_text || ''
        subject = material.subject || subject
        setTitle = body.title || `Flashcards: ${material.title}`
      }
    }

    if (!sourceText || sourceText.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Please provide at least 10 characters of text.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let cards: any[] = []
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
            system: `Extract exactly ${count} active recall flashcards from text. Ensure front is a clear question and back is a concise definition/fact. Output strictly valid JSON: {"cards": [{"front": "...", "back": "...", "topic": "..."}]}`,
            messages: [{ role: 'user', content: sourceText.slice(0, 30000) }],
          }),
        })

        if (response.ok) {
          const resData = await response.json()
          const raw = resData.content?.[0]?.text || ''
          const match = raw.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (Array.isArray(parsed.cards)) cards = parsed.cards
          }
        }
      } catch (e) {
        console.warn('Claude API error in flashcards, using smart extractor:', e)
      }
    }

    if (cards.length === 0) {
      cards = extractFlashcardsLocally(sourceText, count, subject)
    }

    let setId = crypto.randomUUID()
    let persisted = false

    try {
      const { data: setRecord, error: setErr } = await supabase
        .from('flashcard_sets')
        .insert({
          user_id: user.id,
          material_id: body.material_id || null,
          title: setTitle,
          subject,
          card_count: cards.length,
        })
        .select()
        .single()

      if (!setErr && setRecord) {
        setId = setRecord.id
        const cardsPayload = cards.map((c: any, idx: number) => ({
          set_id: setRecord.id,
          user_id: user.id,
          position: idx + 1,
          front: c.front,
          back: c.back,
          topic: c.topic || subject,
          times_reviewed: 0,
        }))

        await supabase.from('flashcards').insert(cardsPayload)
        persisted = true
      }
    } catch (e) {
      console.warn('Remote database insert skipped for flashcard set:', e)
    }

    return new Response(JSON.stringify({
      set_id: setId,
      title: setTitle,
      card_count: cards.length,
      cards,
      persisted_to_remote: persisted,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Failed to generate flashcards' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
