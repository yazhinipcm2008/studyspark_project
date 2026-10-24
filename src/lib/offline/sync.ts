import { supabase } from '@/lib/supabase'
import { getPendingOutboxItems, removeOutboxItem, incrementOutboxRetry } from './outbox'
import { getOfflineDB } from './db'

export type SyncStatus = 'online' | 'offline' | 'syncing'

type SyncListener = (status: SyncStatus, pendingCount: number) => void
const listeners = new Set<SyncListener>()

let currentStatus: SyncStatus = navigator.onLine ? 'online' : 'offline'
let pendingCount = 0

export function getSyncState() {
  return { status: currentStatus, pendingCount }
}

export function subscribeSyncStatus(listener: SyncListener) {
  listeners.add(listener)
  listener(currentStatus, pendingCount)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners() {
  listeners.forEach(l => l(currentStatus, pendingCount))
}

export async function processOutboxSync(): Promise<void> {
  if (!navigator.onLine) {
    currentStatus = 'offline'
    notifyListeners()
    return
  }

  const items = await getPendingOutboxItems()
  pendingCount = items.length

  if (items.length === 0) {
    currentStatus = 'online'
    notifyListeners()
    return
  }

  currentStatus = 'syncing'
  notifyListeners()

  const db = await getOfflineDB()

  for (const item of items) {
    try {
      if (item.action === 'complete_task') {
        const { taskId, completedAt } = item.payload
        // "Completed wins" rule: mark as completed
        const { error } = await supabase
          .from('study_tasks')
          .update({
            completed: true,
            completed_at: completedAt || new Date().toISOString(),
          })
          .eq('id', taskId)

        if (!error) {
          // Log study session
          const cachedTask = await db.get('study_tasks', taskId)
          if (cachedTask) {
            await supabase.from('study_sessions').insert({
              task_id: taskId,
              subject: cachedTask.subject,
              duration_minutes: cachedTask.duration_minutes,
              source: 'task_completion',
            })
            // award points
            await supabase.rpc('award_points_and_badges', {
              p_user_id: cachedTask.user_id,
              p_event_type: 'task_completed',
              p_source_id: taskId,
              p_points: 10,
            })
          }
          await removeOutboxItem(item.id)
        } else {
          await incrementOutboxRetry(item.id)
        }
      } else if (item.action === 'uncomplete_task') {
        const { taskId } = item.payload
        const { error } = await supabase
          .from('study_tasks')
          .update({
            completed: false,
            completed_at: null,
          })
          .eq('id', taskId)

        if (!error) {
          await removeOutboxItem(item.id)
        } else {
          await incrementOutboxRetry(item.id)
        }
      } else if (item.action === 'rate_flashcard') {
        const { cardId, setId, rating } = item.payload
        const { error: revErr } = await supabase.from('flashcard_reviews').insert({
          flashcard_id: cardId,
          set_id: setId,
          rating,
        })
        const { error: cardErr } = await supabase
          .from('flashcards')
          .update({
            difficulty_rating: rating,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq('id', cardId)

        if (!revErr && !cardErr) {
          await removeOutboxItem(item.id)
        } else {
          await incrementOutboxRetry(item.id)
        }
      } else if (item.action === 'submit_cached_quiz') {
        const { quizId, answers, durationSeconds } = item.payload
        const { error } = await supabase.rpc('submit_quiz_attempt', {
          p_quiz_id: quizId,
          p_answers: answers,
          p_duration_seconds: durationSeconds,
        })
        if (!error) {
          await removeOutboxItem(item.id)
        } else {
          await incrementOutboxRetry(item.id)
        }
      } else if (item.action === 'update_task') {
        const { taskId, updates, clientUpdatedAt } = item.payload
        // Fetch server version
        const { data: serverTask } = await supabase
          .from('study_tasks')
          .select('updated_at')
          .eq('id', taskId)
          .single()

        if (serverTask && serverTask.updated_at > clientUpdatedAt) {
          console.warn(`Conflict detected for task ${taskId}. Preserving latest modifications.`)
        }

        const { error } = await supabase
          .from('study_tasks')
          .update(updates)
          .eq('id', taskId)

        if (!error) {
          await removeOutboxItem(item.id)
        } else {
          await incrementOutboxRetry(item.id)
        }
      }
    } catch (err) {
      console.error('Error syncing outbox item:', item, err)
      await incrementOutboxRetry(item.id)
    }
  }

  const remaining = await getPendingOutboxItems()
  pendingCount = remaining.length
  currentStatus = navigator.onLine ? 'online' : 'offline'
  notifyListeners()
}

// Setup network listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    currentStatus = 'online'
    notifyListeners()
    processOutboxSync()
  })

  window.addEventListener('offline', () => {
    currentStatus = 'offline'
    notifyListeners()
  })
}
