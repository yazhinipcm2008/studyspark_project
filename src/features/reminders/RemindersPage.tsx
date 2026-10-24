import React, { useState, useEffect } from 'react'
import {
  Bell,
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatTime } from '@/lib/utils'
import { toast } from 'sonner'
import type { Reminder } from '@/types/database'

export const RemindersPage: React.FC = () => {
  const { user } = useAuth()

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Creation modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'session' | 'task' | 'exam' | 'revision'>('session')
  const [remindAtDate, setRemindAtDate] = useState(new Date().toISOString().split('T')[0])
  const [remindAtTime, setRemindAtTime] = useState('14:00')
  const [isSaving, setIsSaving] = useState(false)

  // Permission state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  )

  const loadReminders = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user.id)
        .order('remind_at', { ascending: true })

      if (error) throw error
      setReminders(data || [])
    } catch (e) {
      console.error('Error loading reminders:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadReminders()
  }, [user])

  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission()
      setNotificationPermission(perm)
      if (perm === 'granted') {
        toast.success('Browser notification permission enabled!')
      } else {
        toast.error('Browser notification permission was not granted.')
      }
    }
  }

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !title.trim()) return
    setIsSaving(true)

    try {
      const timestamp = new Date(`${remindAtDate}T${remindAtTime}:00`).toISOString()

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title: title.trim(),
        kind,
        remind_at: timestamp,
        enabled: true,
      })

      if (error) throw error

      toast.success('Reminder scheduled!')
      setIsCreateOpen(false)
      setTitle('')
      loadReminders()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reminder')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleReminderEnabled = async (rem: Reminder) => {
    const nextVal = !rem.enabled
    setReminders(prev => prev.map(r => (r.id === rem.id ? { ...r, enabled: nextVal } : r)))

    try {
      const { error } = await supabase
        .from('reminders')
        .update({ enabled: nextVal })
        .eq('id', rem.id)

      if (error) throw error
    } catch (e) {
      console.error('Toggle error:', e)
    }
  }

  const handleDeleteReminder = async (id: string) => {
    try {
      const { error } = await supabase.from('reminders').delete().eq('id', id)
      if (error) throw error
      toast.success('Reminder removed')
      setReminders(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      console.error('Delete reminder error:', e)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Study Reminders
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Real in-app and browser notifications for your scheduled sessions and upcoming exams.
          </p>
        </div>

        <Button variant="sun" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Schedule Reminder
        </Button>
      </div>

      {/* Honest Browser Notification Disclaimer */}
      <div className="p-4 rounded-2xl bg-sun-500/10 dark:bg-sun-500/20 border border-sun-300 dark:border-sun-700/50 text-xs text-ink dark:text-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-sun-700 dark:text-sun flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Browser Notifications: </span>
            Reminders fire while StudySpark is open or running in a browser tab. They are not delivered when the browser is fully closed.
            <span className="block mt-0.5 text-neutral-muted font-medium">
              Current browser status: <strong className="capitalize">{notificationPermission}</strong>
            </span>
          </div>
        </div>

        {notificationPermission !== 'granted' && (
          <Button
            variant="sun"
            size="sm"
            onClick={requestBrowserPermission}
            className="flex-shrink-0 text-xs"
          >
            Enable Notifications
          </Button>
        )}
      </div>

      {/* Reminders List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Reminders ({reminders.length})</CardTitle>
          <CardDescription>Checked every 30 seconds by the background scheduler.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Bell className="h-12 w-12 text-neutral-muted/50 mx-auto mb-3" />
              <h4 className="text-base font-bold text-ink dark:text-white">No reminders scheduled</h4>
              <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
                Set reminders for upcoming review sessions or exam dates to receive proactive alerts.
              </p>
              <Button
                variant="sun"
                size="sm"
                className="mt-4"
                onClick={() => setIsCreateOpen(true)}
              >
                Create First Reminder
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-border dark:divide-neutral-border">
              {reminders.map(rem => {
                const remDate = new Date(rem.remind_at)
                const isPast = remDate < new Date()

                return (
                  <div
                    key={rem.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          rem.enabled ? 'bg-sun-100 dark:bg-sun-950/60 text-sun-700 dark:text-sun' : 'bg-neutral-bg dark:bg-surface text-neutral-muted'
                        }`}
                      >
                        <Bell className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4
                            className={`text-sm font-bold ${
                              rem.enabled
                                ? 'text-ink dark:text-white'
                                : 'text-neutral-muted line-through'
                            }`}
                          >
                            {rem.title}
                          </h4>
                          <Badge
                            variant={
                              rem.kind === 'exam' || rem.kind === 'revision'
                                ? 'coral'
                                : rem.kind === 'session'
                                ? 'sun'
                                : 'mint'
                            }
                          >
                            {rem.kind}
                          </Badge>
                          {rem.delivered_at && (
                            <span className="text-[10px] text-mint font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Delivered
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-muted">
                          <span>{formatDate(rem.remind_at)}</span>
                          <span>•</span>
                          <span>{remDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isPast && <span className="text-coral font-semibold">(Past due)</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={() => toggleReminderEnabled(rem)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                          rem.enabled
                            ? 'bg-mint-100 text-mint-700 dark:bg-mint-950/60 dark:text-mint border-mint-200 dark:border-mint-800'
                            : 'bg-neutral-bg text-neutral-muted border-neutral-border dark:border-neutral-border'
                        }`}
                      >
                        {rem.enabled ? 'Active' : 'Muted'}
                      </button>
                      <button
                        onClick={() => handleDeleteReminder(rem.id)}
                        className="p-1.5 rounded-lg text-coral bg-coral/10 hover:bg-coral hover:text-white border border-coral/30 font-bold transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creation Modal */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Schedule Study Reminder"
        description="Set a time to be reminded while StudySpark is open in your browser."
      >
        <form onSubmit={handleCreateReminder} className="space-y-4">
          <div>
            <label className="text-xs font-semibold block mb-1">Reminder Title</label>
            <Input
              required
              placeholder="e.g. Biology Cell Respiration Revision"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Reminder Type</label>
            <select
              value={kind}
              onChange={e => setKind(e.target.value as any)}
              className="w-full rounded-xl border border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated p-2.5 text-xs text-ink dark:text-white"
            >
              <option value="session">Study Session</option>
              <option value="task">Pending Task</option>
              <option value="revision">Weak Topic Revision</option>
              <option value="exam">Upcoming Exam</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Date</label>
              <Input
                type="date"
                required
                value={remindAtDate}
                onChange={e => setRemindAtDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Time</label>
              <Input
                type="time"
                required
                value={remindAtTime}
                onChange={e => setRemindAtTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="sun" size="sm" type="submit" isLoading={isSaving}>
              Set Reminder
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
