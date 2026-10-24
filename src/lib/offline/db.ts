import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Material, StudyPlan, StudyTask, FlashcardSet, Flashcard, QuizAttempt, Reminder } from '@/types/database'

export interface OutboxItem {
  id: string
  action: 'complete_task' | 'uncomplete_task' | 'rate_flashcard' | 'submit_cached_quiz' | 'update_task'
  payload: any
  created_at: string
  retry_count: number
  client_updated_at: string
}

export interface CachedDataSchema extends DBSchema {
  materials: {
    key: string
    value: Material
  }
  study_plans: {
    key: string
    value: StudyPlan
  }
  study_tasks: {
    key: string
    value: StudyTask
    indexes: { 'by-plan': string; 'by-date': string }
  }
  flashcard_sets: {
    key: string
    value: FlashcardSet
  }
  flashcards: {
    key: string
    value: Flashcard
    indexes: { 'by-set': string }
  }
  quiz_attempts: {
    key: string
    value: QuizAttempt
  }
  reminders: {
    key: string
    value: Reminder
  }
  outbox: {
    key: string
    value: OutboxItem
    indexes: { 'by-created': string }
  }
}

const DB_NAME = 'studyspark-offline-db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CachedDataSchema>> | null = null

export function getOfflineDB(): Promise<IDBPDatabase<CachedDataSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CachedDataSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('materials')) {
          db.createObjectStore('materials', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('study_plans')) {
          db.createObjectStore('study_plans', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('study_tasks')) {
          const taskStore = db.createObjectStore('study_tasks', { keyPath: 'id' })
          taskStore.createIndex('by-plan', 'plan_id')
          taskStore.createIndex('by-date', 'scheduled_date')
        }
        if (!db.objectStoreNames.contains('flashcard_sets')) {
          db.createObjectStore('flashcard_sets', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('flashcards')) {
          const cardStore = db.createObjectStore('flashcards', { keyPath: 'id' })
          cardStore.createIndex('by-set', 'set_id')
        }
        if (!db.objectStoreNames.contains('quiz_attempts')) {
          db.createObjectStore('quiz_attempts', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('reminders')) {
          db.createObjectStore('reminders', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' })
          outboxStore.createIndex('by-created', 'created_at')
        }
      },
    })
  }
  return dbPromise
}

// Clear all cache on logout
export async function clearOfflineCache(): Promise<void> {
  const db = await getOfflineDB()
  const stores = ['materials', 'study_plans', 'study_tasks', 'flashcard_sets', 'flashcards', 'quiz_attempts', 'reminders', 'outbox'] as const
  const tx = db.transaction(stores, 'readwrite')
  await Promise.all(stores.map(storeName => tx.objectStore(storeName).clear()))
  await tx.done
}
