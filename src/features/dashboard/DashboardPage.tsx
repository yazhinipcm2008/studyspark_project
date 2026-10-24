import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Flame,
  Clock,
  Brain,
  TrendingUp,
  Award,
  Upload,
  Layers,
  Calendar,
  Sparkles,
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Video,
  Timer,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { getGreeting, formatMinutes, formatDate } from '@/lib/utils'
import { calculateStreaks } from '@/lib/gamification'
import { queueOutboxAction } from '@/lib/offline/outbox'
import { toast } from 'sonner'
import type { StudyTask, TopicPerformance } from '@/types/database'

export const DashboardPage: React.FC = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [totalStudyMinutes, setTotalStudyMinutes] = useState(0)
  const [quizzesCompleted, setQuizzesCompleted] = useState(0)
  const [avgQuizScore, setAvgQuizScore] = useState<number | null>(null)
  const [totalPoints, setTotalPoints] = useState(0)
  const [streakData, setStreakData] = useState({ currentStreak: 0, longestStreak: 0 })
  const [upcomingTasks, setUpcomingTasks] = useState<StudyTask[]>([])
  const [missedTasks, setMissedTasks] = useState<StudyTask[]>([])
  const [weakTopics, setWeakTopics] = useState<TopicPerformance[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  const loadDashboardData = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      // 1. Study Sessions -> Total study time
      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('duration_minutes, started_at, subject')
        .eq('user_id', user.id)

      const minutes = (sessions || []).reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
      setTotalStudyMinutes(minutes)

      // 2. Quizzes Completed & Avg Score
      const { data: attempts } = await supabase
        .from('quiz_attempts')
        .select('score_percent, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')

      setQuizzesCompleted(attempts?.length || 0)
      if (attempts && attempts.length > 0) {
        const sumScores = attempts.reduce((acc, a) => acc + Number(a.score_percent || 0), 0)
        setAvgQuizScore(Math.round(sumScores / attempts.length))
      } else {
        setAvgQuizScore(null)
      }

      // 3. Points Ledger
      const { data: pointsRows } = await supabase
        .from('points_ledger')
        .select('points')
        .eq('user_id', user.id)

      const pts = (pointsRows || []).reduce((acc, p) => acc + (p.points || 0), 0)
      setTotalPoints(pts)

      // 4. Streaks
      const activeDates = new Set<string>()
      sessions?.forEach(s => activeDates.add(s.started_at.split('T')[0]))
      attempts?.forEach(a => activeDates.add(a.completed_at.split('T')[0]))

      const { data: tasksData } = await supabase
        .from('study_tasks')
        .select('*')
        .eq('user_id', user.id)

      tasksData?.forEach(t => {
        if (t.completed && t.completed_at) {
          activeDates.add(t.completed_at.split('T')[0])
        }
      })

      const streak = calculateStreaks(activeDates, profile?.timezone || 'UTC')
      setStreakData({ currentStreak: streak.currentStreak, longestStreak: streak.longestStreak })

      // 5. Upcoming tasks (scheduled for today or next 7 days, incomplete first)
      const todayStr = new Date().toISOString().split('T')[0]
      const nextWeekDate = new Date()
      nextWeekDate.setDate(nextWeekDate.getDate() + 7)
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0]

      const { data: upTasks } = await supabase
        .from('study_tasks')
        .select('*')
        .eq('user_id', user.id)
        .gte('scheduled_date', todayStr)
        .lte('scheduled_date', nextWeekStr)
        .order('scheduled_date', { ascending: true })
        .order('completed', { ascending: true })
        .limit(6)

      setUpcomingTasks(upTasks || [])

      // Overdue incomplete tasks for smart re-plan
      const { data: overdueTasks } = await supabase
        .from('study_tasks')
        .select('*')
        .eq('user_id', user.id)
        .lt('scheduled_date', todayStr)
        .eq('completed', false)

      setMissedTasks(overdueTasks || [])

      // 6. Top 3 weak topics (score < 60% with at least 5 questions answered)
      const { data: weakData } = await supabase
        .from('topic_performance')
        .select('*')
        .eq('user_id', user.id)
        .lt('score_percent', 60)
        .gte('total', 5)
        .order('score_percent', { ascending: true })
        .limit(3)

      setWeakTopics(weakData || [])

      // 7. Recent activity feed (combining latest quiz attempts and sessions)
      const recent: any[] = []
      if (attempts) {
        attempts.slice(-3).forEach(a => {
          recent.push({
            type: 'quiz',
            text: `Completed Quiz (${a.score_percent}% score)`,
            date: a.completed_at,
          })
        })
      }
      if (sessions) {
        sessions.slice(-3).forEach(s => {
          recent.push({
            type: 'session',
            text: `Studied ${s.subject} (${s.duration_minutes} min)`,
            date: s.started_at,
          })
        })
      }
      recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setRecentActivities(recent.slice(0, 5))
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [user])

  const toggleTaskCompletion = async (task: StudyTask) => {
    const nextCompleted = !task.completed
    const completedAt = nextCompleted ? new Date().toISOString() : null

    // Optimistic UI update
    setUpcomingTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, completed: nextCompleted, completed_at: completedAt } : t))
    )

    if (!navigator.onLine) {
      await queueOutboxAction(nextCompleted ? 'complete_task' : 'uncomplete_task', {
        taskId: task.id,
        completedAt,
      })
      toast.info('Task updated offline. Changes will sync once reconnected.')
      return
    }

    try {
      const { error } = await supabase
        .from('study_tasks')
        .update({
          completed: nextCompleted,
          completed_at: completedAt,
        })
        .eq('id', task.id)

      if (error) throw error

      if (nextCompleted) {
        // Record study session
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
        loadDashboardData()
      } else {
        toast.info('Task unmarked')
      }
    } catch (err) {
      console.error('Failed to update task:', err)
      toast.error('Failed to update task')
      // Rollback
      setUpcomingTasks(prev =>
        prev.map(t => (t.id === task.id ? { ...t, completed: task.completed } : t))
      )
    }
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || null

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Dashboard Hero Banner (#3B82F6 to #22C5E8) */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-hero text-white shadow-soft relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2 z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5 text-sun-300" /> {getGreeting(displayName)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Ready to power through today's study goals?
          </h1>
          <p className="text-sm text-white/90 leading-relaxed">
            {streakData.currentStreak > 0
              ? `You're on a ${streakData.currentStreak}-day study streak! Keep up the momentum with active recall & focus sessions.`
              : 'Welcome to StudySpark! Complete a study session or quiz today to start your streak.'}
          </p>
        </div>

        {/* Streak Chip (#FFB400 to #FF6B57 with navy text) */}
        <div className="inline-flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-streak text-ink-navy shadow-md self-start sm:self-auto z-10 font-bold flex-shrink-0">
          <div className="h-10 w-10 rounded-xl bg-white/30 flex items-center justify-center">
            <Flame className="h-6 w-6 text-coral-700" />
          </div>
          <div>
            <div className="text-base font-extrabold leading-none text-ink-navy">
              {streakData.currentStreak} Day{streakData.currentStreak === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-ink-navy/80 font-semibold leading-tight mt-0.5">
              Longest: {streakData.longestStreak}d streak
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* 2x2 Stat Tiles with 4 distinct colors: study time blue, quizzes coral, avg score mint, points sun */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Study Time (Blue) */}
        <Card className="p-4 sm:p-5 border-t-2 border-t-blue shadow-soft hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-neutral-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Study Time</span>
            <div className="h-8 w-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white">
                {formatMinutes(totalStudyMinutes)}
              </div>
            )}
            <p className="text-[11px] text-neutral-muted mt-0.5">Logged sessions</p>
          </div>
        </Card>

        {/* Stat 2: Quizzes Completed (Coral) */}
        <Card className="p-4 sm:p-5 border-t-2 border-t-coral shadow-soft hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-neutral-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Quizzes</span>
            <div className="h-8 w-8 rounded-xl bg-coral-100 dark:bg-coral-950/60 text-coral-600 dark:text-coral-400 flex items-center justify-center">
              <Brain className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white">
                {quizzesCompleted}
              </div>
            )}
            <p className="text-[11px] text-neutral-muted mt-0.5">Completed attempts</p>
          </div>
        </Card>

        {/* Stat 3: Avg Score (Mint) */}
        <Card className="p-4 sm:p-5 border-t-2 border-t-mint shadow-soft hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-neutral-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Score</span>
            <div className="h-8 w-8 rounded-xl bg-mint-100 dark:bg-mint-950/60 text-mint-600 dark:text-mint-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white">
                {avgQuizScore !== null ? `${avgQuizScore}%` : '—'}
              </div>
            )}
            <p className="text-[11px] text-neutral-muted mt-0.5">
              {avgQuizScore !== null ? 'Overall quiz accuracy' : 'Take a quiz to view'}
            </p>
          </div>
        </Card>

        {/* Stat 4: Points (Sun) */}
        <Card className="p-4 sm:p-5 border-t-2 border-t-sun shadow-soft hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-neutral-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Points</span>
            <div className="h-8 w-8 rounded-xl bg-sun-100 dark:bg-sun-950/60 text-sun-700 dark:text-sun-400 flex items-center justify-center">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white">
                {totalPoints}
              </div>
            )}
            <p className="text-[11px] text-neutral-muted mt-0.5">Earned from study actions</p>
          </div>
        </Card>
      </div>

      {/* Live Study Rooms Card (Feature: Pink) */}
      <Card className="p-5 sm:p-6 bg-pink-50/70 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="space-y-1.5 z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300 text-[11px] font-bold tracking-wide uppercase">
            <span className="h-2 w-2 rounded-full bg-pink-500 animate-pulse" /> Live Collaborative Study
          </div>
          <h3 className="text-xl font-extrabold tracking-tight text-ink dark:text-white">
            Peer Study Rooms & Live Code Sandbox
          </h3>
          <p className="text-xs sm:text-sm text-neutral-muted dark:text-neutral-300 leading-relaxed">
            Study with classmates over live video call, run code in real-time, and take synchronized shared study notes.
          </p>
        </div>
        <Button
          onClick={() => navigate('/study-room')}
          className="bg-pink text-ink-navy hover:bg-pink/90 font-bold z-10 flex-shrink-0 shadow-sm text-xs"
          size="sm"
        >
          <Video className="h-4 w-4 mr-1.5 text-ink-navy" /> Join / Create Room
        </Button>
      </Card>

      {/* Quick Actions (Each uses feature color as soft tinted card with solid icon chip) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-muted mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {/* Action 1: Upload (Study Materials: Sky) */}
          <button
            onClick={() => navigate('/materials')}
            className="p-4 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-850 text-left hover:border-sky-400 dark:hover:border-sky-700 transition-all group flex flex-col justify-between h-28 shadow-soft"
          >
            <div className="h-9 w-9 rounded-xl bg-sky text-ink-navy flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform font-bold">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink dark:text-white">Study Materials</p>
              <p className="text-[11px] text-neutral-muted">PDF, Audio, Video</p>
            </div>
          </button>

          {/* Action 2: Focus Timer (Gradient #FF6B57 to #FFB400) */}
          <button
            onClick={() => navigate('/focus')}
            className="p-4 rounded-2xl bg-gradient-focus text-ink-navy text-left shadow-soft hover:opacity-95 transition-all group flex flex-col justify-between h-28"
          >
            <div className="h-9 w-9 rounded-xl bg-white/80 backdrop-blur-md text-coral flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-navy">Focus Timer</p>
              <p className="text-[11px] text-ink-navy/80 font-medium">Pomodoro & Zen</p>
            </div>
          </button>

          {/* Action 3: Quiz (Quizzes: Blue) */}
          <button
            onClick={() => navigate('/quizzes')}
            className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-850 text-left hover:border-blue-400 dark:hover:border-blue-700 transition-all group flex flex-col justify-between h-28 shadow-soft"
          >
            <div className="h-9 w-9 rounded-xl bg-blue text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink dark:text-white">Quizzes</p>
              <p className="text-[11px] text-neutral-muted">Active recall test</p>
            </div>
          </button>

          {/* Action 4: Flashcards (Flashcards: Coral) */}
          <button
            onClick={() => navigate('/flashcards')}
            className="p-4 rounded-2xl bg-coral-50/80 dark:bg-coral-950/30 border border-coral-200 dark:border-coral-850 text-left hover:border-coral-400 dark:hover:border-coral-700 transition-all group flex flex-col justify-between h-28 shadow-soft"
          >
            <div className="h-9 w-9 rounded-xl bg-coral text-ink-navy flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink dark:text-white">Flashcards</p>
              <p className="text-[11px] text-neutral-muted">3D flip review</p>
            </div>
          </button>

          {/* Action 5: Planner (Gradient #14C38E to #22C5E8) */}
          <button
            onClick={() => navigate('/planner')}
            className="p-4 rounded-2xl bg-gradient-planner text-ink-navy text-left shadow-soft hover:opacity-95 transition-all group flex flex-col justify-between h-28"
          >
            <div className="h-9 w-9 rounded-xl bg-white/80 backdrop-blur-md text-mint-700 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-navy">Study Planner</p>
              <p className="text-[11px] text-ink-navy/80 font-medium">Daily schedules</p>
            </div>
          </button>
        </div>
      </div>

      {/* Main Grid: Upcoming Tasks + Weak Topics & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Upcoming Tasks (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Smart Re-Plan Overdue Banner */}
          {missedTasks.length > 0 && (
            <div className="p-4 rounded-2xl bg-sun-50 dark:bg-sun-950/30 border border-sun-200 dark:border-sun-800 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-sun-200/70 dark:bg-sun-900/60 text-sun-800 dark:text-sun-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-ink dark:text-white">
                      {missedTasks.length} Overdue Study {missedTasks.length === 1 ? 'Task' : 'Tasks'}
                    </h4>
                    <Badge variant="sun">Smart Re-Plan</Badge>
                  </div>
                  <p className="text-[11px] text-neutral-muted dark:text-neutral-300 mt-0.5">
                    Missed earlier tasks? 1-click re-plan reschedules them before exams, boosting your weak quiz topics.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => navigate('/planner?replan=true')}
                className="flex-shrink-0 bg-sun text-ink-navy hover:bg-sun/90 font-bold shadow-sm text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Re-Plan Now
              </Button>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle>Upcoming Study Tasks</CardTitle>
                <CardDescription>Scheduled for today and the next 7 days</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/planner')} className="text-blue hover:text-blue-700">
                View Planner <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : upcomingTasks.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-xl border border-dashed border-neutral-border dark:border-neutral-800">
                  <Calendar className="h-10 w-10 text-neutral-muted/50 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-ink dark:text-white">No upcoming tasks</h4>
                  <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
                    Generate an AI study plan based on your upcoming exam dates to stay on track.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 border-mint text-mint-700 dark:text-mint hover:bg-mint-50 dark:hover:bg-mint-950/40" onClick={() => navigate('/planner')}>
                    Create Study Plan
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingTasks.map(task => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        task.completed
                          ? 'bg-neutral-bg/60 dark:bg-neutral-800/40 border-neutral-border dark:border-neutral-800 opacity-60'
                          : 'bg-white dark:bg-surface border-neutral-border dark:border-neutral-800 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleTaskCompletion(task)}
                          className="text-blue hover:scale-110 transition-transform p-0.5"
                          title={task.completed ? 'Mark incomplete' : 'Complete task'}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-mint fill-mint/20" />
                          ) : (
                            <Circle className="h-5 w-5 text-neutral-muted hover:text-blue" />
                          )}
                        </button>
                        <div>
                          <p
                            className={`text-sm font-bold text-ink dark:text-white ${
                              task.completed ? 'line-through text-neutral-muted' : ''
                            }`}
                          >
                            {task.topic}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-muted">
                            <span>{task.subject}</span>
                            <span>•</span>
                            <span>{formatDate(task.scheduled_date)}</span>
                            <span>•</span>
                            <span>{task.duration_minutes} min</span>
                          </div>
                        </div>
                      </div>

                      <Badge
                        variant={
                          task.priority === 'high'
                            ? 'hard'
                            : task.priority === 'medium'
                            ? 'medium'
                            : 'easy'
                        }
                      >
                        {task.task_type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Weak Topics & Recent Activity (1 col) */}
        <div className="space-y-6">
          {/* Weak Topics Card (Feature: Coral) */}
          <Card className="border-t-2 border-t-coral">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Focus Areas</CardTitle>
                <CardDescription>Topics needing review (&lt; 60% score)</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/weak-topics')} className="text-coral hover:text-coral-600">
                More
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : weakTopics.length === 0 ? (
                <div className="text-center py-6 px-3 rounded-xl bg-neutral-bg/60 dark:bg-neutral-800/40 border border-neutral-border dark:border-neutral-800">
                  <CheckCircle2 className="h-8 w-8 text-mint mx-auto mb-1" />
                  <p className="text-xs font-bold text-ink dark:text-white">No weak topics identified</p>
                  <p className="text-[11px] text-neutral-muted mt-0.5">
                    Requires 5+ answered questions per topic to identify areas needing practice.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {weakTopics.map(item => (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold truncate max-w-[150px]">{item.topic}</span>
                        <span className="font-semibold text-coral">{item.score_percent}%</span>
                      </div>
                      <Progress
                        value={Number(item.score_percent)}
                        indicatorClassName="bg-coral"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivities.length === 0 ? (
                <p className="text-xs text-neutral-muted text-center py-4">
                  No recorded activity yet. Complete a quiz or review notes to begin.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((act, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className="h-2 w-2 rounded-full bg-blue mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-ink dark:text-neutral-200">{act.text}</p>
                        <p className="text-[10px] text-neutral-muted">{formatDate(act.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
