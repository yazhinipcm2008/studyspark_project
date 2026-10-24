import { supabase } from '@/lib/supabase'
import type { Reminder } from '@/types/database'
import { toast } from 'sonner'

class ReminderScheduler {
  private timerId: number | null = null
  private userId: string | null = null
  private onDueCallback?: (reminder: Reminder) => void

  public init(userId: string, onDue?: (reminder: Reminder) => void) {
    this.userId = userId
    this.onDueCallback = onDue

    // Check missed reminders on load
    this.checkMissedReminders()

    // Start 30-second interval
    if (this.timerId) clearInterval(this.timerId)
    this.timerId = window.setInterval(() => {
      this.checkDueReminders()
    }, 30000)

    // Run first check immediately
    this.checkDueReminders()
  }

  public stop() {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private async checkDueReminders() {
    if (!this.userId || !navigator.onLine) return

    try {
      const now = new Date().toISOString()
      const { data: dueReminders, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', this.userId)
        .eq('enabled', true)
        .is('delivered_at', null)
        .lte('remind_at', now)

      if (error || !dueReminders || dueReminders.length === 0) return

      for (const reminder of dueReminders) {
        this.triggerNotification(reminder)
        // Mark delivered in DB
        await supabase
          .from('reminders')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', reminder.id)
      }
    } catch (err) {
      console.error('Error checking due reminders:', err)
    }
  }

  private async checkMissedReminders() {
    if (!this.userId || !navigator.onLine) return

    try {
      const now = new Date().toISOString()
      const { data: missed, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', this.userId)
        .eq('enabled', true)
        .is('delivered_at', null)
        .lt('remind_at', now)

      if (error || !missed || missed.length === 0) return

      if (missed.length === 1) {
        toast.info(`Missed Reminder: ${missed[0].title}`, {
          description: `Scheduled for ${new Date(missed[0].remind_at).toLocaleTimeString()}`,
          duration: 6000,
        })
      } else {
        toast.info(`You missed ${missed.length} reminders while you were away`, {
          duration: 6000,
        })
      }
    } catch (err) {
      console.error('Error checking missed reminders:', err)
    }
  }

  private triggerNotification(reminder: Reminder) {
    // 1. In-app toast
    toast.message(`🔔 Study Reminder: ${reminder.title}`, {
      description: `Kind: ${reminder.kind.toUpperCase()}`,
      duration: 8000,
    })

    // 2. Browser Native Notification if granted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification('StudySpark Reminder', {
            body: reminder.title,
            icon: '/favicon.svg',
          })
        } catch (e) {
          console.warn('Browser notification failed:', e)
        }
      }
    }

    if (this.onDueCallback) {
      this.onDueCallback(reminder)
    }
  }
}

export const reminderScheduler = new ReminderScheduler()
