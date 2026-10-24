import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  Sparkles,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Trash2,
  Edit2,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Target,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { formatDate, formatMinutes } from '@/lib/utils'
import { queueOutboxAction } from '@/lib/offline/outbox'
import { toast } from 'sonner'
import type { StudyPlan, StudyTask, TopicPerformance, Reminder } from '@/types/database'
import { generateStudyPlanLocally } from '@/lib/aiFallback'
import { getOfflineDB } from '@/lib/offline/db'
import {
  calculateSmartRePlan,
  applySmartRePlanToDatabase,
  type SmartRePlanProposal,
  type SmartRePlanSummary,
} from '@/lib/smartPlanRescheduler'

export const StudyPlannerPage: React.FC = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Weak topics and exam reminders for intelligent rescheduling
  const [weakTopics, setWeakTopics] = useState<TopicPerformance[]>([])
  const [examReminders, setExamReminders] = useState<Reminder[]>([])

  // Plan creation modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [planTitle, setPlanTitle] = useState('Finals Prep Plan')
  const [subjectsInput, setSubjectsInput] = useState('Biology, Organic Chemistry, Calculus')
  const [examDatesInput, setExamDatesInput] = useState([
    { subject: 'Biology', date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] },
    { subject: 'Organic Chemistry', date: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0] },
  ])
  const [availableHours, setAvailableHours] = useState(3)
  const [sessionDuration, setSessionDuration] = useState(45)
  const [importantTopics, setImportantTopics] = useState('')
  const [blockedSlots, setBlockedSlots] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Smart Re-plan missed tasks modal
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false)
  const [smartProposals, setSmartProposals] = useState<SmartRePlanProposal[]>([])
  const [smartSummary, setSmartSummary] = useState<SmartRePlanSummary | null>(null)
  const [isApplyingReschedule, setIsApplyingReschedule] = useState(false)

  // Manual Add / Edit Task Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null)
  const [taskSubject, setTaskSubject] = useState('')
  const [taskTopic, setTaskTopic] = useState('')
  const [taskType, setTaskType] = useState<'study' | 'revision' | 'practice'>('study')
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0])
  const [taskDuration, setTaskDuration] = useState(45)
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [isSavingTask, setIsSavingTask] = useState(false)

  // Active Timer state
  const [activeTimerTask, setActiveTimerTask] = useState<StudyTask | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)

  // Study timer tick
  useEffect(() => {
    let interval: number
    if (isTimerRunning) {
      interval = window.setInterval(() => {
        setTimerSeconds(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning])

  const loadPlansAndTasks = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      let remotePlans: StudyPlan[] = []

      // 1. Try loading from Supabase
      try {
        const { data: plansData, error: pErr } = await supabase
          .from('study_plans')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (!pErr && plansData) {
          remotePlans = plansData
        }
      } catch (err) {
        console.warn('Supabase remote study_plans not loaded:', err)
      }

      // 2. Load cached/offline plans from IndexedDB
      let localPlans: StudyPlan[] = []
      try {
        const db = await getOfflineDB()
        localPlans = await db.getAll('study_plans')
      } catch (e) {
        console.warn('IndexedDB load warning:', e)
      }

      // 3. Merge plans (remote first, then local)
      const allPlansMap = new Map<string, StudyPlan>()
      remotePlans.forEach(p => allPlansMap.set(p.id, p))
      localPlans.forEach(p => {
        if (!allPlansMap.has(p.id)) allPlansMap.set(p.id, p)
      })

      const combinedPlans = Array.from(allPlansMap.values())
      setPlans(combinedPlans)

      const currentPlan = selectedPlanId
        ? combinedPlans.find(p => p.id === selectedPlanId)
        : combinedPlans[0]

      if (currentPlan) {
        setSelectedPlanId(currentPlan.id)

        // Load tasks (remote then local)
        let loadedTasks: StudyTask[] = []
        try {
          const { data: tasksData, error: tErr } = await supabase
            .from('study_tasks')
            .select('*')
            .eq('plan_id', currentPlan.id)
            .eq('user_id', user.id)
            .order('scheduled_date', { ascending: true })

          if (!tErr && tasksData && tasksData.length > 0) {
            loadedTasks = tasksData
          }
        } catch (e) {
          console.warn('Supabase remote study_tasks not loaded:', e)
        }

        if (loadedTasks.length === 0) {
          try {
            const db = await getOfflineDB()
            loadedTasks = await db.getAllFromIndex('study_tasks', 'by-plan', currentPlan.id)
          } catch (e) {
            console.warn('IndexedDB tasks load error:', e)
          }
        }

        setTasks(loadedTasks)
      } else {
        setTasks([])
      }

      // 4. Fetch weak topics and exam reminders for intelligent rescheduling
      try {
        const { data: topicData } = await supabase
          .from('topic_performance')
          .select('*')
          .eq('user_id', user.id)
        if (topicData) setWeakTopics(topicData)
      } catch (e) {
        console.warn('Topic performance load note:', e)
      }

      try {
        const { data: remData } = await supabase
          .from('reminders')
          .select('*')
          .eq('user_id', user.id)
          .eq('kind', 'exam')
        if (remData) setExamReminders(remData)
      } catch (e) {
        console.warn('Reminders load note:', e)
      }
    } catch (err: any) {
      console.warn('Notice loading plans:', err?.message || err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPlansAndTasks()
  }, [user, selectedPlanId])

  // Automatically trigger smart re-plan if navigated with ?replan=true
  useEffect(() => {
    const shouldReplan = searchParams.get('replan') === 'true'
    if (shouldReplan && tasks.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const missed = tasks.filter(t => !t.completed && t.scheduled_date < today)
      if (missed.length > 0) {
        openReschedulePreview()
      }
    }
  }, [searchParams, tasks.length])

  // Generate Plan via Edge Function
  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenError(null)

    const subjects = subjectsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (subjects.length === 0) {
      setGenError('Please enter at least one subject.')
      return
    }

    if (examDatesInput.length === 0) {
      setGenError('Please specify at least one upcoming exam date.')
      return
    }

    setIsGenerating(true)

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not authenticated')

      let resultPlanId: string | null = null
      let hasWeakTopics = false
      let weakCount = 0

      // 1. Try Supabase Edge Function first
      try {
        const { data, error } = await supabase.functions.invoke('generate-study-plan', {
          body: {
            title: planTitle.trim() || 'Semester Study Plan',
            subjects,
            exam_dates: examDatesInput,
            available_hours_per_day: Number(availableHours),
            session_length_minutes: Number(sessionDuration),
            important_topics: importantTopics.trim(),
            blocked_slots: blockedSlots.trim(),
          },
        })

        if (!error && data?.plan_id) {
          resultPlanId = data.plan_id
          hasWeakTopics = !!data.has_weak_topics_weighted
          weakCount = data.weak_topics_count || 0
        } else if (error) {
          console.warn('Edge function returned error, attempting browser AI generator:', error.message)
        }
      } catch (edgeErr: any) {
        console.warn('Edge function unavailable, falling back to browser generator:', edgeErr?.message)
      }

      // 2. Fallback to smart in-browser generator if Edge Function is not deployed
      if (!resultPlanId) {
        const localResult = await generateStudyPlanLocally({
          userId: session.user.id,
          title: planTitle.trim() || 'Semester Study Plan',
          subjects,
          examDates: examDatesInput,
          availableHoursPerDay: Number(availableHours),
          sessionLengthMinutes: Number(sessionDuration),
          importantTopics: importantTopics.trim(),
          blockedSlots: blockedSlots.trim(),
        })
        resultPlanId = localResult.plan_id
      }

      toast.success(
        hasWeakTopics
          ? `Study plan created with extra revision on your weak topics (+${weakCount} detected)!`
          : 'Study plan generated successfully!'
      )

      setIsCreateOpen(false)
      if (resultPlanId) setSelectedPlanId(resultPlanId)
      loadPlansAndTasks()
    } catch (err: any) {
      setGenError(err.message || 'Failed to generate study plan')
    } finally {
      setIsGenerating(false)
    }
  }

  // Toggle Task Completion
  const handleToggleTask = async (task: StudyTask) => {
    const nextCompleted = !task.completed
    const completedAt = nextCompleted ? new Date().toISOString() : null

    // Optimistic UI update
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, completed: nextCompleted, completed_at: completedAt } : t))
    )

    if (!navigator.onLine) {
      await queueOutboxAction(nextCompleted ? 'complete_task' : 'uncomplete_task', {
        taskId: task.id,
        completedAt,
      })
      toast.info('Task updated offline. Changes will synchronize.')
      return
    }

    try {
      const { error } = await supabase
        .from('study_tasks')
        .update({ completed: nextCompleted, completed_at: completedAt })
        .eq('id', task.id)

      if (error) throw error

      if (nextCompleted) {
        // Log study session
        await supabase.from('study_sessions').insert({
          task_id: task.id,
          subject: task.subject,
          duration_minutes: task.duration_minutes,
          source: 'task_completion',
        })
        // Award points
        await supabase.rpc('award_points_and_badges', {
          p_user_id: user?.id,
          p_event_type: 'task_completed',
          p_source_id: task.id,
          p_points: 10,
        })
        toast.success(`Completed "${task.topic}" (+10 pts)!`)
      }
    } catch (err) {
      console.error('Failed to toggle task:', err)
      toast.error('Failed to update task')
    }
  }

  // Smart plan rescheduling respecting exam dates and weak topics
  const openReschedulePreview = () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const missed = tasks.filter(t => !t.completed && t.scheduled_date < todayStr)

    if (missed.length === 0) {
      toast.info('No overdue or incomplete past tasks to reschedule.')
      return
    }

    const currentPlan = plans.find(p => p.id === selectedPlanId) || plans[0]

    const summary = calculateSmartRePlan({
      plan: currentPlan,
      missedTasks: missed,
      existingTasks: tasks.filter(t => t.scheduled_date >= todayStr),
      weakTopics,
      customExamDates: examDatesInput,
      examReminders,
      availableHoursPerDay: availableHours,
    })

    setSmartSummary(summary)
    setSmartProposals(summary.proposals)
    setIsRescheduleOpen(true)
  }

  const applyReschedule = async () => {
    if (smartProposals.length === 0) return
    setIsApplyingReschedule(true)
    try {
      const movedCount = await applySmartRePlanToDatabase(smartProposals)
      toast.success(
        `Smart Re-Plan applied! Rescheduled ${movedCount} tasks before exam cutoffs, prioritizing weak topics.`
      )
      setIsRescheduleOpen(false)
      loadPlansAndTasks()
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply smart reschedule')
    } finally {
      setIsApplyingReschedule(false)
    }
  }

  // Manual Add / Edit Task
  const openTaskModal = (task?: StudyTask) => {
    if (task) {
      setEditingTask(task)
      setTaskSubject(task.subject)
      setTaskTopic(task.topic)
      setTaskType(task.task_type)
      setTaskDate(task.scheduled_date)
      setTaskDuration(task.duration_minutes)
      setTaskPriority(task.priority)
    } else {
      setEditingTask(null)
      setTaskSubject('General')
      setTaskTopic('')
      setTaskType('study')
      setTaskDate(new Date().toISOString().split('T')[0])
      setTaskDuration(45)
      setTaskPriority('medium')
    }
    setIsTaskModalOpen(true)
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlanId || !user) return
    setIsSavingTask(true)

    try {
      if (editingTask) {
        const { error } = await supabase
          .from('study_tasks')
          .update({
            subject: taskSubject.trim(),
            topic: taskTopic.trim(),
            task_type: taskType,
            scheduled_date: taskDate,
            duration_minutes: Number(taskDuration),
            priority: taskPriority,
          })
          .eq('id', editingTask.id)

        if (error) throw error
        toast.success('Task updated')
      } else {
        const { error } = await supabase.from('study_tasks').insert({
          plan_id: selectedPlanId,
          user_id: user.id,
          subject: taskSubject.trim(),
          topic: taskTopic.trim(),
          task_type: taskType,
          scheduled_date: taskDate,
          duration_minutes: Number(taskDuration),
          priority: taskPriority,
          completed: false,
        })

        if (error) throw error
        toast.success('Task created')
      }

      setIsTaskModalOpen(false)
      loadPlansAndTasks()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save task')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase.from('study_tasks').delete().eq('id', taskId)
      if (error) throw error
      toast.success('Task deleted')
      loadPlansAndTasks()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete task')
    }
  }

  // Study Timer on Task
  const startTimerOnTask = (task: StudyTask) => {
    setActiveTimerTask(task)
    setTimerSeconds(0)
    setIsTimerRunning(true)
    toast.info(`Study timer started for "${task.topic}"`)
  }

  const stopAndLogTimer = async () => {
    if (!activeTimerTask || !user) return
    setIsTimerRunning(false)

    const minutes = Math.max(Math.round(timerSeconds / 60), 1)
    try {
      await supabase.from('study_sessions').insert({
        task_id: activeTimerTask.id,
        subject: activeTimerTask.subject,
        duration_minutes: minutes,
        source: 'timer',
      })
      toast.success(`Logged ${minutes} min study session for "${activeTimerTask.topic}"!`)
      setActiveTimerTask(null)
      setTimerSeconds(0)
    } catch (e) {
      console.error('Failed to log timer session:', e)
    }
  }

  // Group tasks by scheduled_date
  const groupedTasks: Record<string, StudyTask[]> = {}
  tasks.forEach(t => {
    if (!groupedTasks[t.scheduled_date]) groupedTasks[t.scheduled_date] = []
    groupedTasks[t.scheduled_date].push(t)
  })

  const sortedDates = Object.keys(groupedTasks).sort()
  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length
  const planProgressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const activePlan = plans.find(p => p.id === selectedPlanId)
  const isWeakTopicWeighted = Boolean((activePlan?.config as any)?.has_weak_topics_weighted)

  const todayStr = new Date().toISOString().split('T')[0]
  const missedTasks = tasks.filter(t => !t.completed && t.scheduled_date < todayStr)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Adaptive Study Planner
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Exam-aligned spaced repetition schedules tailored to your real progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={missedTasks.length > 0 ? 'sun' : 'outline'}
            size="sm"
            onClick={openReschedulePreview}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Smart Re-Plan {missedTasks.length > 0 ? `(${missedTasks.length})` : ''}
          </Button>
          <Button variant="mint" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Generate AI Plan
          </Button>
        </div>
      </div>

      {/* Smart Re-Plan Overdue Missed Tasks Banner */}
      {missedTasks.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-sun-50 dark:bg-sun-950/30 border border-sun-200 dark:border-sun-800 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-sun-200/70 dark:bg-sun-900/60 text-sun-800 dark:text-sun-300 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink dark:text-white">
                  You have {missedTasks.length} missed study {missedTasks.length === 1 ? 'task' : 'tasks'}!
                </h4>
                <Badge variant="sun">Smart Re-Plan Available</Badge>
              </div>
              <p className="text-xs text-neutral-muted dark:text-neutral-300 mt-0.5 max-w-2xl leading-relaxed">
                Our smart re-planner will redistribute your incomplete tasks before upcoming exam dates, prioritizing your weakest quiz topics without exceeding your daily study limits.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={openReschedulePreview}
            className="flex-shrink-0 bg-sun text-ink-navy hover:bg-sun/90 font-bold shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> One-Click Smart Re-Plan
          </Button>
        </div>
      )}

      {/* Active Timer Floating Alert */}
      {activeTimerTask && (
        <div className="p-4 rounded-2xl bg-gradient-planner text-ink-navy flex items-center justify-between shadow-soft animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/40 flex items-center justify-center font-bold">
              <Clock className="h-5 w-5 animate-spin text-mint-800" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-navy/80">Active Study Timer</p>
              <h4 className="text-sm font-bold text-ink-navy">{activeTimerTask.topic} ({activeTimerTask.subject})</h4>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xl font-extrabold text-ink-navy">
              {Math.floor(timerSeconds / 60).toString().padStart(2, '0')}:
              {(timerSeconds % 60).toString().padStart(2, '0')}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-ink-navy hover:bg-white/90 border-transparent font-bold text-xs shadow-sm"
              onClick={stopAndLogTimer}
            >
              Finish & Log Session
            </Button>
          </div>
        </div>
      )}

      {/* Plan Header & Progress Bar */}
      {activePlan && (
        <Card className="p-5 sm:p-6 space-y-4 border-t-2 border-t-mint shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink dark:text-white">{activePlan.title}</h2>
                {isWeakTopicWeighted && (
                  <Badge variant="mint">
                    Weighted using your weak topics from quiz results
                  </Badge>
                )}
              </div>
              <p className="text-xs text-neutral-muted mt-1">
                {formatDate(activePlan.start_date)} — {formatDate(activePlan.end_date)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openTaskModal()} className="border-mint text-mint-700 dark:text-mint hover:bg-mint-50 dark:hover:bg-mint-950/40">
                <Plus className="h-4 w-4 mr-1" /> Add Custom Task
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-neutral-muted">
              <span>Overall Plan Progress</span>
              <span>
                {completedCount} of {totalCount} tasks completed ({planProgressPct}%)
              </span>
            </div>
            <Progress value={completedCount} max={totalCount} indicatorClassName="bg-mint" />
          </div>
        </Card>
      )}

      {/* Plan Selection Dropdown if multiple exist */}
      {plans.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-muted font-medium">Switch Plan:</span>
          <select
            value={selectedPlanId}
            onChange={e => setSelectedPlanId(e.target.value)}
            className="rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface px-3 py-1.5 text-xs text-ink dark:text-white"
          >
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tasks Grouped by Date */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : sortedDates.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <CalendarIcon className="h-12 w-12 text-mint mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-ink dark:text-white">No tasks scheduled</h3>
          <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
            Generate your personalized exam study plan to organize daily study blocks.
          </p>
          <Button variant="mint" size="sm" className="mt-5" onClick={() => setIsCreateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Generate Exam Plan
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(dateStr => {
            const dayTasks = groupedTasks[dateStr]
            const isToday = dateStr === new Date().toISOString().split('T')[0]
            const dayDone = dayTasks.filter(t => t.completed).length
            const dayTotal = dayTasks.length
            const dayPct = Math.round((dayDone / dayTotal) * 100)

            return (
              <div key={dateStr} className="space-y-3">
                {/* Date Header with Daily Progress */}
                <div className="flex items-center justify-between text-xs pb-1 border-b border-neutral-border dark:border-neutral-800">
                  <div className="flex items-center gap-2 font-bold">
                    <span className={isToday ? 'text-mint' : 'text-ink dark:text-white'}>
                      {formatDate(dateStr)}
                    </span>
                    {isToday && <Badge variant="mint">Today</Badge>}
                  </div>
                  <span className="text-neutral-muted font-medium">
                    {dayDone}/{dayTotal} completed ({dayPct}%)
                  </span>
                </div>

                {/* Day Tasks List */}
                <div className="space-y-2">
                  {dayTasks.map(task => (
                    <Card
                      key={task.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                        task.completed ? 'opacity-60 bg-neutral-bg dark:bg-neutral-800/40' : 'hover:border-mint-300 dark:hover:border-mint-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className="hover:scale-110 transition-transform p-0.5 flex-shrink-0"
                          title={task.completed ? 'Mark incomplete' : 'Mark completed'}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-mint fill-mint/20" />
                          ) : (
                            <Circle className="h-5 w-5 text-neutral-muted hover:text-mint" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4
                              className={`text-sm font-bold text-ink dark:text-white ${
                                task.completed ? 'line-through text-neutral-muted' : ''
                              }`}
                            >
                              {task.topic}
                            </h4>
                            <Badge
                              variant={
                                task.task_type === 'revision'
                                  ? 'easy'
                                  : task.task_type === 'practice'
                                  ? 'medium'
                                  : 'default'
                              }
                            >
                              {task.task_type}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-muted mt-0.5">
                            <span className="font-semibold text-ink dark:text-neutral-300">{task.subject}</span>
                            <span>•</span>
                            <span>{task.duration_minutes} min</span>
                            {task.notes && (
                              <>
                                <span>•</span>
                                <span className="italic">{task.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {!task.completed && (
                          <Button
                            variant="mint-subtle"
                            size="sm"
                            className="font-bold shadow-xs"
                            onClick={() => startTimerOnTask(task)}
                            title="Start study timer for this task"
                          >
                            <Play className="h-3 w-3 mr-1 text-mint" /> Start Timer
                          </Button>
                        )}
                        <Button
                          variant="sun-subtle"
                          size="sm"
                          className="h-8 px-2.5 font-bold"
                          onClick={() => openTaskModal(task)}
                          title="Edit task"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="coral-subtle"
                          size="sm"
                          className="h-8 px-2.5 font-bold"
                          onClick={() => handleDeleteTask(task.id)}
                          title="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Plan Generation Modal */}
      <Dialog
        open={isCreateOpen}
        onClose={() => !isGenerating && setIsCreateOpen(false)}
        title="Generate AI Study Plan"
        description="Creates a balanced schedule between today and your exam dates."
      >
        <form onSubmit={handleGeneratePlan} className="space-y-4">
          {genError && (
            <div className="p-3 text-xs text-destructive bg-coral-50 dark:bg-coral-950/20 rounded-xl border border-coral-200 dark:border-coral-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-coral" />
              <span>{genError}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold block mb-1">Plan Title</label>
            <Input
              value={planTitle}
              onChange={e => setPlanTitle(e.target.value)}
              placeholder="e.g. Midterm Mastery Plan"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">
              Subjects (comma separated)
            </label>
            <Input
              value={subjectsInput}
              onChange={e => setSubjectsInput(e.target.value)}
              placeholder="e.g. Biology, Calculus, History"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">Upcoming Exam Dates</label>
              <button
                type="button"
                onClick={() =>
                  setExamDatesInput(prev => [
                    ...prev,
                    { subject: 'Subject', date: new Date().toISOString().split('T')[0] },
                  ])
                }
                className="text-xs text-mint font-bold hover:underline"
              >
                + Add Exam
              </button>
            </div>
            <div className="space-y-2">
              {examDatesInput.map((exam, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder="Subject Name"
                    value={exam.subject}
                    onChange={e => {
                      const updated = [...examDatesInput]
                      updated[idx].subject = e.target.value
                      setExamDatesInput(updated)
                    }}
                  />
                  <Input
                    type="date"
                    value={exam.date}
                    onChange={e => {
                      const updated = [...examDatesInput]
                      updated[idx].date = e.target.value
                      setExamDatesInput(updated)
                    }}
                  />
                  {examDatesInput.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setExamDatesInput(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Max Study Hours / Day</label>
              <Input
                type="number"
                min={1}
                max={12}
                value={availableHours}
                onChange={e => setAvailableHours(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Session Duration (min)</label>
              <Input
                type="number"
                min={15}
                max={120}
                value={sessionDuration}
                onChange={e => setSessionDuration(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Important or Difficult Topics (optional)</label>
            <Input
              value={importantTopics}
              onChange={e => setImportantTopics(e.target.value)}
              placeholder="e.g. Krebs cycle, Integration by parts"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Blocked Commitments (optional)</label>
            <Input
              value={blockedSlots}
              onChange={e => setBlockedSlots(e.target.value)}
              placeholder="e.g. Tuesdays 2pm-5pm lab"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="mint" size="sm" type="submit" isLoading={isGenerating}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {isGenerating ? 'Structuring Plan...' : 'Generate Plan'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Smart Plan Rescheduling Modal */}
      <Dialog
        open={isRescheduleOpen}
        onClose={() => !isApplyingReschedule && setIsRescheduleOpen(false)}
        title="⚡ Smart Plan Rescheduling"
        description="One-click re-plan that redistributes missed tasks before your exams, giving highest urgency to your weak quiz topics."
        confirmText={`Apply Smart Re-Plan (${smartProposals.length} Tasks)`}
        confirmVariant="mint"
        onConfirm={applyReschedule}
        isConfirmLoading={isApplyingReschedule}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Summary Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-sun-500/10 border border-sun-500/20 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sun-600 dark:text-sun-400 block">
                Overdue Tasks
              </span>
              <span className="text-base font-extrabold text-ink dark:text-white">
                {smartProposals.length}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-coral-500/10 border border-coral-500/20 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-coral-600 dark:text-coral-400 block">
                Weak Topics Boosted
              </span>
              <span className="text-base font-extrabold text-ink dark:text-white">
                {smartSummary?.weakTopicsPrioritizedCount || 0}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Exams Protected
              </span>
              <span className="text-base font-extrabold text-ink dark:text-white">
                {smartSummary?.examsProtectedCount || 0}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-mint-500/10 border border-mint-500/20 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-mint-600 dark:text-mint-400 block">
                Max Daily Cap
              </span>
              <span className="text-base font-extrabold text-ink dark:text-white">
                {availableHours}h / day
              </span>
            </div>
          </div>

          {/* Earliest upcoming exam notice if available */}
          {smartSummary?.earliestExamSubject && (
            <div className="p-3 rounded-xl bg-mint-50/70 dark:bg-mint-950/40 border border-mint-200 dark:border-mint-900/60 flex items-center justify-between text-xs text-mint-800 dark:text-mint-300">
              <span className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-mint" />
                Upcoming Exam: {smartSummary.earliestExamSubject} ({formatDate(smartSummary.earliestExamDate!)})
              </span>
              <span className="text-[11px] font-bold">Placed before exam deadline</span>
            </div>
          )}

          {/* Proposals List */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
              Proposed Schedule Changes
            </h4>

            {smartProposals.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                  item.isWeakTopic
                    ? 'border-coral-400/40 bg-coral-50/20 dark:bg-coral-950/20'
                    : 'border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-xs sm:text-sm text-ink dark:text-white">
                        {item.task.topic}
                      </h5>
                      <Badge
                        variant={
                          item.priority === 'high'
                            ? 'hard'
                            : item.priority === 'medium'
                            ? 'medium'
                            : 'default'
                        }
                      >
                        {item.priority.toUpperCase()}
                      </Badge>
                      {item.isWeakTopic && (
                        <Badge variant="coral" className="text-[10px]">
                          Weak ({item.weakTopicScore}%)
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-muted mt-0.5">
                      <span className="font-semibold text-ink dark:text-neutral-300">
                        {item.task.subject}
                      </span>
                      <span>•</span>
                      <span>{item.task.duration_minutes} min</span>
                      <span>•</span>
                      <span className="line-through text-destructive">
                        Was: {formatDate(item.originalDate)}
                      </span>
                    </div>
                  </div>

                  {/* Target date control */}
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="text-[11px] font-bold text-mint flex items-center gap-1">
                      New Date: <ArrowRight className="h-3 w-3" />
                    </span>
                    <input
                      type="date"
                      value={item.proposedDate}
                      onChange={e => {
                        const next = [...smartProposals]
                        next[idx].proposedDate = e.target.value
                        setSmartProposals(next)
                      }}
                      className="rounded-xl border border-neutral-border dark:border-neutral-800 bg-neutral-bg dark:bg-surface px-2.5 py-1 text-xs font-bold text-ink dark:text-white focus:outline-none focus:border-mint"
                    />
                  </div>
                </div>

                {/* Explanation reason tag */}
                <div className="p-2 rounded-xl bg-neutral-bg dark:bg-neutral-800/70 text-[11px] font-medium text-neutral-muted flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-mint flex-shrink-0" />
                  <span>{item.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* Manual Task Add/Edit Modal */}
      <Dialog
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Add Study Task'}
      >
        <form onSubmit={handleSaveTask} className="space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1">Subject</label>
            <Input
              required
              value={taskSubject}
              onChange={e => setTaskSubject(e.target.value)}
              placeholder="e.g. Biology"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Topic</label>
            <Input
              required
              value={taskTopic}
              onChange={e => setTaskTopic(e.target.value)}
              placeholder="e.g. Cellular Mitosis"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Type</label>
              <select
                value={taskType}
                onChange={e => setTaskType(e.target.value as any)}
                className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-2 text-xs"
              >
                <option value="study">Study</option>
                <option value="revision">Revision</option>
                <option value="practice">Practice</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Priority</label>
              <select
                value={taskPriority}
                onChange={e => setTaskPriority(e.target.value as any)}
                className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-2 text-xs"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Date</label>
              <Input
                type="date"
                required
                value={taskDate}
                onChange={e => setTaskDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Duration (min)</label>
              <Input
                type="number"
                min={10}
                max={240}
                required
                value={taskDuration}
                onChange={e => setTaskDuration(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="mint" size="sm" type="submit" isLoading={isSavingTask}>
              {editingTask ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
