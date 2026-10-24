import type { StudyTask, TopicPerformance, StudyPlan, Reminder } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { getOfflineDB } from '@/lib/offline/db'

export interface SmartRePlanProposal {
  task: StudyTask
  originalDate: string
  proposedDate: string
  priority: 'low' | 'medium' | 'high'
  isWeakTopic: boolean
  weakTopicScore?: number
  examDate?: string
  daysBeforeExam?: number
  reason: string
}

export interface SmartRePlanSummary {
  proposals: SmartRePlanProposal[]
  totalTasksMoved: number
  weakTopicsPrioritizedCount: number
  examsProtectedCount: number
  earliestExamSubject?: string
  earliestExamDate?: string
}

export interface SmartRePlanOptions {
  plan?: StudyPlan | null
  missedTasks: StudyTask[]
  existingTasks: StudyTask[]
  weakTopics?: TopicPerformance[]
  customExamDates?: { subject: string; date: string }[]
  examReminders?: Reminder[]
  availableHoursPerDay?: number
}

/**
 * Normalizes text to assist in fuzzy matching topics
 */
function cleanTopic(t: string): string {
  return t
    .toLowerCase()
    .replace(/^(revision|practice|study|chapter|unit)\s*:\s*/i, '')
    .trim()
}

/**
 * Calculates days difference between two YYYY-MM-DD date strings
 */
function diffDays(targetDate: string, baseDate: string): number {
  const target = new Date(targetDate)
  const base = new Date(baseDate)
  const diffTime = target.getTime() - base.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Core Smart Re-Planning Algorithm
 * Takes overdue/missed tasks and redistributes them into the student's upcoming calendar
 * while strictly respecting exam deadlines, prioritizing weak quiz topics, and balancing daily hours.
 */
export function calculateSmartRePlan(options: SmartRePlanOptions): SmartRePlanSummary {
  const {
    plan,
    missedTasks,
    existingTasks,
    weakTopics = [],
    customExamDates = [],
    examReminders = [],
    availableHoursPerDay = 3,
  } = options

  if (!missedTasks || missedTasks.length === 0) {
    return {
      proposals: [],
      totalTasksMoved: 0,
      weakTopicsPrioritizedCount: 0,
      examsProtectedCount: 0,
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const maxDailyMinutes = Math.max(90, availableHoursPerDay * 60)

  // 1. Compile Exam Dates dictionary per subject
  const examMap = new Map<string, string>()

  // From plan config
  const planExams = (plan?.config as any)?.examDates as { subject: string; date: string }[] | undefined
  if (Array.isArray(planExams)) {
    planExams.forEach(e => {
      if (e.subject && e.date) {
        examMap.set(e.subject.trim().toLowerCase(), e.date)
      }
    })
  }

  // From custom exam inputs
  customExamDates.forEach(e => {
    if (e.subject && e.date) {
      examMap.set(e.subject.trim().toLowerCase(), e.date)
    }
  })

  // From exam reminders
  examReminders.forEach(r => {
    if (r.remind_at) {
      const dateOnly = r.remind_at.split('T')[0]
      examMap.set(r.title.toLowerCase().trim(), dateOnly)
    }
  })

  // 2. Compile Weak Topics dictionary
  const weakTopicMap = new Map<string, TopicPerformance>()
  weakTopics.forEach(wt => {
    const key = `${wt.subject.toLowerCase()}::${cleanTopic(wt.topic)}`
    weakTopicMap.set(key, wt)
    weakTopicMap.set(cleanTopic(wt.topic), wt)
  })

  // 3. Track daily study load (minutes) for all future scheduled tasks
  const dailyLoads: Record<string, number> = {}
  existingTasks.forEach(t => {
    if (t.scheduled_date >= todayStr && !t.completed) {
      dailyLoads[t.scheduled_date] = (dailyLoads[t.scheduled_date] || 0) + (t.duration_minutes || 45)
    }
  })

  // 4. Calculate urgency and rank missed tasks
  interface RankedMissedTask {
    task: StudyTask
    urgencyScore: number
    isWeakTopic: boolean
    weakTopicScore?: number
    examDate?: string
    daysUntilExam?: number
  }

  const rankedTasks: RankedMissedTask[] = missedTasks.map(task => {
    const subKey = task.subject.trim().toLowerCase()
    const examDate = examMap.get(subKey) || plan?.end_date || undefined
    const daysUntilExam = examDate ? diffDays(examDate, todayStr) : undefined

    // Check if topic is weak
    const fullKey = `${subKey}::${cleanTopic(task.topic)}`
    const matchedWeak = weakTopicMap.get(fullKey) || weakTopicMap.get(cleanTopic(task.topic))
    const isWeak = Boolean(matchedWeak && Number(matchedWeak.score_percent) < 70)
    const weakScore = matchedWeak ? Number(matchedWeak.score_percent) : undefined

    let urgencyScore = 0

    // Exam proximity scoring
    if (daysUntilExam !== undefined) {
      if (daysUntilExam <= 3) urgencyScore += 120
      else if (daysUntilExam <= 7) urgencyScore += 80
      else if (daysUntilExam <= 14) urgencyScore += 40
    }

    // Weak topic scoring (lower score = higher urgency)
    if (isWeak && weakScore !== undefined) {
      urgencyScore += 70 + (100 - weakScore) * 0.5
    }

    if (task.priority === 'high') urgencyScore += 20

    return {
      task,
      urgencyScore,
      isWeakTopic: isWeak,
      weakTopicScore: weakScore,
      examDate,
      daysUntilExam,
    }
  })

  // Sort by urgency descending (most critical tasks scheduled first)
  rankedTasks.sort((a, b) => b.urgencyScore - a.urgencyScore)

  // 5. Redistribute into future dates
  const proposals: SmartRePlanProposal[] = []
  let weakTopicsPrioritizedCount = 0
  let examsProtectedCount = 0

  for (const item of rankedTasks) {
    const task = item.task
    const taskMinutes = task.duration_minutes || 45
    const examDate = item.examDate

    // Determine the latest allowable date: 1 day before the exam, or on exam date if no time left
    let deadlineDateStr = examDate
    if (examDate) {
      const daysLeft = diffDays(examDate, todayStr)
      if (daysLeft > 1) {
        const examD = new Date(examDate)
        examD.setDate(examD.getDate() - 1)
        deadlineDateStr = examD.toISOString().split('T')[0]
      }
    }

    // Find candidate date starting tomorrow (or today if space permits)
    let chosenDateStr = ''

    // If today is light, can we fit this task today?
    const todayLoad = dailyLoads[todayStr] || 0
    if (todayLoad + taskMinutes <= maxDailyMinutes && (item.isWeakTopic || (item.daysUntilExam !== undefined && item.daysUntilExam <= 3))) {
      chosenDateStr = todayStr
    } else {
      // Loop forward up to 28 days or up to the exam deadline
      let bestFallbackDate = ''
      let minLoadFallback = Infinity

      for (let offset = 1; offset <= 28; offset++) {
        const d = new Date()
        d.setDate(d.getDate() + offset)
        const dateStr = d.toISOString().split('T')[0]

        // If we have an exam deadline, do not schedule past it
        if (deadlineDateStr && dateStr > deadlineDateStr) {
          break
        }

        const currentLoad = dailyLoads[dateStr] || 0

        // If under daily limit, pick this slot!
        if (currentLoad + taskMinutes <= maxDailyMinutes) {
          chosenDateStr = dateStr
          break
        }

        // Track day with minimal load before exam as fallback
        if (currentLoad < minLoadFallback) {
          minLoadFallback = currentLoad
          bestFallbackDate = dateStr
        }
      }

      // If all pre-exam slots are packed, use the best available pre-exam slot or next available day
      if (!chosenDateStr) {
        if (bestFallbackDate) {
          chosenDateStr = bestFallbackDate
        } else {
          const d = new Date()
          d.setDate(d.getDate() + 1)
          chosenDateStr = d.toISOString().split('T')[0]
        }
      }
    }

    // Record load on chosen date
    dailyLoads[chosenDateStr] = (dailyLoads[chosenDateStr] || 0) + taskMinutes

    // Determine priority and user-facing explanation
    let proposedPriority: 'low' | 'medium' | 'high' = 'medium'
    const reasons: string[] = []

    if (item.daysUntilExam !== undefined) {
      const daysFromChosenToExam = diffDays(item.examDate!, chosenDateStr)
      if (daysFromChosenToExam >= 0) {
        examsProtectedCount++
        reasons.push(`Scheduled ${daysFromChosenToExam}d before ${task.subject} Exam (${item.examDate})`)
      }
      if (item.daysUntilExam <= 7) {
        proposedPriority = 'high'
      }
    }

    if (item.isWeakTopic) {
      weakTopicsPrioritizedCount++
      proposedPriority = 'high'
      reasons.push(`Weak topic priority (${item.weakTopicScore}% quiz score)`)
    }

    if (reasons.length === 0) {
      reasons.push('Balanced study slot to prevent daily overload')
    }

    proposals.push({
      task,
      originalDate: task.scheduled_date,
      proposedDate: chosenDateStr,
      priority: proposedPriority,
      isWeakTopic: item.isWeakTopic,
      weakTopicScore: item.weakTopicScore,
      examDate: item.examDate,
      daysBeforeExam: item.examDate ? diffDays(item.examDate, chosenDateStr) : undefined,
      reason: reasons.join(' • '),
    })
  }

  // Find earliest upcoming exam details for summary banner
  let earliestExamSubject: string | undefined
  let earliestExamDate: string | undefined
  let earliestDays = Infinity

  examMap.forEach((date, subject) => {
    const days = diffDays(date, todayStr)
    if (days >= 0 && days < earliestDays) {
      earliestDays = days
      earliestExamSubject = subject.toUpperCase()
      earliestExamDate = date
    }
  })

  return {
    proposals,
    totalTasksMoved: proposals.length,
    weakTopicsPrioritizedCount,
    examsProtectedCount,
    earliestExamSubject,
    earliestExamDate,
  }
}

/**
 * Commits the smart re-plan to Supabase and IndexedDB
 */
export async function applySmartRePlanToDatabase(proposals: SmartRePlanProposal[]): Promise<number> {
  let appliedCount = 0

  for (const p of proposals) {
    const updatedNotes = p.task.notes
      ? `${p.task.notes} | [Smart Re-Plan: ${p.reason}]`
      : `[Smart Re-Plan: ${p.reason}]`

    // 1. Update remote Supabase
    try {
      const { error } = await supabase
        .from('study_tasks')
        .update({
          scheduled_date: p.proposedDate,
          priority: p.priority,
          notes: updatedNotes,
        })
        .eq('id', p.task.id)

      if (!error) {
        appliedCount++
      }
    } catch (remoteErr) {
      console.warn('Supabase task reschedule note:', remoteErr)
    }

    // 2. Update local IndexedDB
    try {
      const db = await getOfflineDB()
      const existing = await db.get('study_tasks', p.task.id)
      if (existing) {
        existing.scheduled_date = p.proposedDate
        existing.priority = p.priority
        existing.notes = updatedNotes
        await db.put('study_tasks', existing)
      }
    } catch (idbErr) {
      console.warn('IndexedDB task reschedule note:', idbErr)
    }
  }

  return appliedCount
}
