/**
 * Automatic Question and Option Sanitizer
 * Detects crude/raw-copy questions (e.g., 'Which of the following describes: "..."?')
 * and automatically refines the question prompt, cleans the correct answer,
 * and replaces generic dummy distractors with realistic, academic alternatives.
 */

export interface BaseQuestion {
  id?: string
  question_text?: string
  question?: string
  options: string[]
  correct_answer: string
  explanation?: string
  topic?: string
  [key: string]: any
}

const BOGUS_PATTERNS = [
  /high-impedance/i,
  /asynchronous\s+(?:latch|clock|condition)/i,
  /inverted\s+feedback/i,
  /None of the\s+(?:defined|above|parameters)/i,
  /standard\s+non-blocking/i,
  /sequential\s+latch/i,
]

export function cleanOptionText(text: string): string {
  if (!text) return ''
  let cleaned = text.replace(/\s*\.\.\.\s*$/, '').trim()
  if (cleaned.includes(':') && !cleaned.slice(0, 20).includes('->')) {
    const parts = cleaned.split(':')
    if (parts[0].length < 35 && parts[1].length > 5) {
      cleaned = parts.slice(1).join(':').trim()
    }
  } else if (cleaned.includes(':') && cleaned.includes('->')) {
    const parts = cleaned.split(':')
    if (parts[0].length < 35 && parts[1].includes('->')) {
      cleaned = parts.slice(1).join(':').trim()
    }
  }
  return cleaned
}

export function sanitizeQuestion<T extends BaseQuestion>(q: T, fallbackTopic?: string): T {
  let newQText = (q.question_text || q.question || '').trim()
  let newAns = (q.correct_answer || '').trim()
  const origAns = (q.correct_answer || '').trim()

  // 1. Detect if question quotes a raw line or formula
  const quoteMatch = newQText.match(
    /(?:Which of the following (?:correctly )?describes|Explain the concept|Define or explain):\s*["']?([^"']+)["']?\??/i
  )

  if (quoteMatch && quoteMatch[1]) {
    const raw = quoteMatch[1].trim()
    if (raw.includes(':')) {
      const parts = raw.split(':')
      const term = parts[0].trim()
      const detail = parts.slice(1).join(':').trim()

      if (detail.includes('->')) {
        newQText = `In computer architecture, what is the stage execution sequence for "${term}"?`
        newAns = cleanOptionText(detail)
      } else {
        newQText = `What is the primary role or definition of "${term}"?`
        newAns = cleanOptionText(detail)
      }
    } else if (raw.includes('->')) {
      newQText = `What is the correct sequential order of stages for instruction execution?`
      newAns = cleanOptionText(raw)
    } else {
      newQText = `Which of the following statements accurately characterizes "${raw.slice(0, 55)}"?`
    }
  } else if (newQText.startsWith('What is ') && newQText.includes(':')) {
    const parts = newQText.replace(/^What is /i, '').split(':')
    newQText = `What is the primary definition or function of "${parts[0].trim()}"?`
    if (parts[1]) {
      newAns = cleanOptionText(parts.slice(1).join(':'))
    }
  }

  newAns = cleanOptionText(newAns)

  // 2. Clean options & replace bogus distractors
  const hasArrows = newAns.includes('->')
  const arrowDistractors = [
    'I1 -> ID -> IF -> MEM -> EX',
    'I1 -> IF -> EX -> ID -> MEM',
    'I1 -> IF -> ID -> MEM -> EX',
    'I1 -> MEM -> IF -> ID -> EX',
  ]

  const generalDistractors = [
    'Overlaps multiple instruction execution stages concurrently in separate hardware units.',
    'Increases total instruction throughput while individual stage latency remains fixed.',
    'Bypasses the instruction decode stage by dynamically pre-fetching branch targets.',
    'Requires a complete pipeline flush on every clock cycle to preserve register coherence.',
  ]

  const cleanOptions: string[] = []
  const existingOptions = Array.isArray(q.options) ? q.options : []

  for (const opt of existingOptions) {
    const isBogus = BOGUS_PATTERNS.some(p => p.test(opt))
    const cleaned = cleanOptionText(opt)
    if (opt === origAns || cleaned === newAns) {
      if (!cleanOptions.includes(newAns)) {
        cleanOptions.push(newAns)
      }
    } else if (!isBogus && cleaned !== newAns && cleaned.length > 3) {
      if (!cleanOptions.includes(cleaned)) {
        cleanOptions.push(cleaned)
      }
    }
  }

  // Ensure correct answer is present in options
  if (!cleanOptions.includes(newAns)) {
    cleanOptions.unshift(newAns)
  }

  // Fill up to 4 options with realistic alternatives
  const pool = hasArrows ? arrowDistractors : generalDistractors
  for (const d of pool) {
    if (cleanOptions.length < 4 && !cleanOptions.includes(d) && d !== newAns) {
      cleanOptions.push(d)
    }
  }

  // Deterministic stable shuffle based on character codes of question text
  let seed = (newQText.length || 7)
  for (let i = 0; i < newQText.length; i++) seed = (seed * 31 + newQText.charCodeAt(i)) & 0xffffffff
  const shuffledOptions = [...cleanOptions].sort((a, b) => {
    const hashA = a.split('').reduce((acc, c) => acc + c.charCodeAt(0), seed)
    const hashB = b.split('').reduce((acc, c) => acc + c.charCodeAt(0), seed)
    return (hashA % 17) - (hashB % 17)
  })

  return {
    ...q,
    question_text: newQText,
    question: newQText,
    options: shuffledOptions,
    correct_answer: newAns,
    explanation: q.explanation || newAns,
    topic: q.topic || fallbackTopic || 'General',
  }
}

export function sanitizeQuestions<T extends BaseQuestion>(questions: T[], fallbackTopic?: string): T[] {
  return questions.map(q => sanitizeQuestion(q, fallbackTopic))
}
