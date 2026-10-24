export async function callClaude({
  systemPrompt,
  userPrompt,
  maxTokens = 4000,
  temperature = 0.3,
}: {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing from Supabase secrets. Please configure it in your Supabase project settings.')
  }

  // Model selection: defaults to CLAUDE_MODEL secret or claude-sonnet-5-5 (fallback claude-3-5-sonnet-20241022)
  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-3-5-sonnet-20241022'

  let lastError: Error | null = null

  // 1 retry on 429/5xx with backoff
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        const status = response.status
        if ((status === 429 || status >= 500) && attempt === 0) {
          console.warn(`Claude API status ${status}, retrying with backoff...`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
        throw new Error(`Claude API error (${status}): ${errorText}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text
      if (!text) {
        throw new Error('Claude API returned an empty response.')
      }

      return text
    } catch (err: any) {
      lastError = err
      if (err.name === 'AbortError') {
        throw new Error('Claude API call timed out after 45 seconds. Please try again with shorter material.')
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    }
  }

  throw lastError || new Error('Claude API call failed after retries.')
}

export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '')
  }
  return cleaned.trim()
}
