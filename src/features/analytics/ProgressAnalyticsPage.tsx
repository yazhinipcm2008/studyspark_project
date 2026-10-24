import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts'
import {
  BarChart3,
  TrendingUp,
  Clock,
  Award,
  Calendar,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BADGES } from '@/lib/gamification'
import { formatDate, formatMinutes } from '@/lib/utils'
import type { QuizAttempt, StudySession, Achievement } from '@/types/database'

export const ProgressAnalyticsPage: React.FC = () => {
  const { user, profile, isDarkMode } = useAuth()

  const [timeRange, setTimeRange] = useState<'6W' | '3M' | '1Y'>('6W')
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadAnalytics = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      // 1. Attempts
      const { data: attData } = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: true })

      setAttempts(attData || [])

      // 2. Study sessions
      const { data: sessData } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: true })

      setSessions(sessData || [])

      // 3. Achievements with dynamic milestone reconciliation
      let achData: any[] = []
      try {
        const res = await supabase
          .from('achievements')
          .select('*')
          .eq('user_id', user.id)
        if (res.data) achData = res.data
      } catch (achErr) {
        console.warn('Could not load achievements:', achErr)
      }

      // Check flashcard sets & study plans to evaluate milestones
      const [flashcardsRes, plansRes] = await Promise.all([
        supabase.from('flashcard_sets').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('study_plans').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      const autoBadges: Achievement[] = achData.map(a => ({
        id: a.id,
        user_id: a.user_id,
        badge_key: a.badge_key || a.badge_id,
        earned_at: a.earned_at || a.unlocked_at || a.created_at || new Date().toISOString(),
      }))

      const completedQuizzesCount = (attData || []).length
      const hasPerfectQuiz = (attData || []).some(
        a => Number(a.score_percent) === 100 || Number(a.percentage) === 100
      )
      const hasPlan = (plansRes.count || 0) > 0
      const hasFlashcardSet = (flashcardsRes.count || 0) > 0

      const toUnlock: string[] = []
      if (completedQuizzesCount >= 1 && !autoBadges.some(b => b.badge_key === 'first_quiz')) {
        toUnlock.push('first_quiz')
      }
      if (completedQuizzesCount >= 5 && !autoBadges.some(b => b.badge_key === 'five_quizzes')) {
        toUnlock.push('five_quizzes')
      }
      if (hasPerfectQuiz && !autoBadges.some(b => b.badge_key === 'perfect_score')) {
        toUnlock.push('perfect_score')
      }
      if (hasPlan && !autoBadges.some(b => b.badge_key === 'first_plan')) {
        toUnlock.push('first_plan')
      }
      if (hasFlashcardSet && !autoBadges.some(b => b.badge_key === 'first_flashcard_set')) {
        toUnlock.push('first_flashcard_set')
      }

      if (toUnlock.length > 0) {
        const nowIso = new Date().toISOString()
        const newRecords = toUnlock.map(key => ({
          user_id: user.id,
          badge_key: key,
          badge_id: key,
          earned_at: nowIso,
        }))

        // Push to database safely
        try {
          await supabase.from('achievements').insert(newRecords)
          await supabase.from('points_ledger').insert(
            toUnlock.map(key => ({
              user_id: user.id,
              points: BADGES[key]?.pointsReward || 25,
              reason: `Earned ${BADGES[key]?.title || key} badge`,
              source_type: 'badge',
            }))
          )
        } catch (dbErr) {
          console.warn('Could not persist unlocked badges to database:', dbErr)
        }

        // Add to state immediately
        for (const r of newRecords) {
          autoBadges.push({
            id: crypto.randomUUID(),
            user_id: user.id,
            badge_key: r.badge_key,
            earned_at: r.earned_at,
          })
        }
      }

      setAchievements(autoBadges)
    } catch (err) {
      console.error('Error loading analytics:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [user])

  // Filter attempts based on timeRange
  const now = new Date()
  let daysCutoff = 42 // 6 weeks default
  if (timeRange === '3M') daysCutoff = 90
  if (timeRange === '1Y') daysCutoff = 365

  const cutoffDate = new Date(now.getTime() - daysCutoff * 86400000)

  const filteredAttempts = attempts.filter(a => new Date(a.completed_at) >= cutoffDate)

  // Chart data: Quiz score over time
  const scoreChartData = filteredAttempts.map((a, i) => ({
    name: formatDate(a.completed_at),
    score: Number(a.score_percent),
    attemptIndex: i + 1,
  }))

  // Chart data: Study time by day of week (last 7 days)
  const last7DaysMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    last7DaysMap[key] = 0
  }

  sessions.forEach(s => {
    const dateKey = s.started_at.split('T')[0]
    if (last7DaysMap[dateKey] !== undefined) {
      last7DaysMap[dateKey] += s.duration_minutes
    }
  })

  const dailyStudyData = Object.entries(last7DaysMap).map(([dateKey, minutes]) => {
    const d = new Date(dateKey)
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
    return {
      day: dayName,
      minutes,
      hours: +(minutes / 60).toFixed(1),
    }
  })

  // Weekly Goal Ring
  const weeklyGoalMinutes = profile?.weekly_goal_minutes || 720
  // Study time in current week
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const thisWeekMinutes = sessions
    .filter(s => new Date(s.started_at) >= weekStart)
    .reduce((acc, s) => acc + s.duration_minutes, 0)

  const weeklyGoalPct = Math.min(Math.round((thisWeekMinutes / weeklyGoalMinutes) * 100), 100)

  // Overall statistics
  const totalQuizScore = attempts.reduce((acc, a) => acc + Number(a.score_percent), 0)
  const overallAvgScore = attempts.length > 0 ? Math.round(totalQuizScore / attempts.length) : null
  const totalMinutesStudied = sessions.reduce((acc, s) => acc + s.duration_minutes, 0)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Progress & Performance Analytics
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Real mastery trajectories and study time metrics logged from your work.
          </p>
        </div>

        {/* Time range selector */}
        <div className="flex p-1 bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border rounded-2xl self-start sm:self-auto">
          {(['6W', '3M', '1Y'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${timeRange === range
                  ? 'bg-mint text-ink-navy shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
                }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Weekly Goal Progress */}
        <Card className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
              Weekly Goal
            </span>
            <div className="text-2xl font-extrabold text-ink dark:text-white mt-1">
              {formatMinutes(thisWeekMinutes)} / {formatMinutes(weeklyGoalMinutes)}
            </div>
            <p className="text-xs text-neutral-muted mt-0.5">{weeklyGoalPct}% completed this week</p>
          </div>
          {/* Progress Circular Ring Visual */}
          <div className="relative h-14 w-14 flex items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-neutral-border dark:text-neutral-border"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-mint transition-all duration-500 ease-out"
                strokeDasharray={`${weeklyGoalPct}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-[11px] font-extrabold text-ink dark:text-white">
              {weeklyGoalPct}%
            </span>
          </div>
        </Card>

        {/* Overall Average Score */}
        <Card className="p-5">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
            Average Score
          </span>
          <div className="text-2xl font-extrabold text-ink dark:text-white mt-1">
            {overallAvgScore !== null ? `${overallAvgScore}%` : '—'}
          </div>
          <p className="text-xs text-neutral-muted mt-0.5">Across {attempts.length} completed quizzes</p>
        </Card>

        {/* Total Time Studied */}
        <Card className="p-5">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
            Total Study Time
          </span>
          <div className="text-2xl font-extrabold text-ink dark:text-white mt-1">
            {formatMinutes(totalMinutesStudied)}
          </div>
          <p className="text-xs text-neutral-muted mt-0.5">
            Across {sessions.length} logged study sessions
          </p>
        </Card>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Quiz Scores Over Time */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div>
            <CardTitle className="text-base">Quiz Accuracy Over Time</CardTitle>
            <CardDescription>Visualizing scores across chronological attempts ({timeRange})</CardDescription>
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : scoreChartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <TrendingUp className="h-8 w-8 text-neutral-muted/40 mb-2" />
                <p className="text-xs font-bold text-ink dark:text-white">No quiz attempts in this window</p>
                <p className="text-[11px] text-neutral-muted">Take a practice quiz to chart your scores</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isDarkMode ? '#34E0B0' : '#14C38E'} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={isDarkMode ? '#34E0B0' : '#14C38E'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} opacity={0.8} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: isDarkMode ? '#9AA7CC' : '#6B7390' }} stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: isDarkMode ? '#9AA7CC' : '#6B7390' }} stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#161E36' : '#FFFFFF',
                      border: isDarkMode ? '1px solid #2B3760' : '1px solid #E8E4DC',
                      borderRadius: '12px',
                      color: isDarkMode ? '#F1F5FF' : '#1B2559',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={isDarkMode ? '#34E0B0' : '#14C38E'}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#scoreGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Chart 2: Daily Study Time (Bar Chart) */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div>
            <CardTitle className="text-base">Study Time (Last 7 Days)</CardTitle>
            <CardDescription>Daily logged hours across tasks, timers, and reviews</CardDescription>
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStudyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} opacity={0.8} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: isDarkMode ? '#9AA7CC' : '#6B7390' }} stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} />
                  <YAxis tick={{ fontSize: 10, fill: isDarkMode ? '#9AA7CC' : '#6B7390' }} stroke={isDarkMode ? '#2B3760' : '#E8E4DC'} />
                  <Tooltip
                    formatter={(val: any) => [`${val} hours`, 'Study Duration']}
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#161E36' : '#FFFFFF',
                      border: isDarkMode ? '1px solid #2B3760' : '1px solid #E8E4DC',
                      borderRadius: '12px',
                      color: isDarkMode ? '#F1F5FF' : '#1B2559',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                    {dailyStudyData.map((entry, index) => {
                      const maxHours = Math.max(...dailyStudyData.map(d => d.hours), 0)
                      // Highlight top day with sun, otherwise sky
                      const isPeak = entry.hours > 0 && entry.hours === maxHours
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isPeak ? (isDarkMode ? '#FFD166' : '#FFB400') : (isDarkMode ? '#4DD8F5' : '#22C5E8')}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Earned Badges & Gamification Achievements */}
      <Card>
        <CardHeader>
          <CardTitle>Earned Badges & Milestones</CardTitle>
          <CardDescription>
            Unlocked through verified study milestones and point bonuses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {Object.values(BADGES).map(badge => {
                const earned = achievements.find(a => a.badge_key === badge.key)

                return (
                  <div
                    key={badge.key}
                    className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-2 ${earned
                        ? 'bg-white dark:bg-surface-elevated border-mint-200 dark:border-mint-800 shadow-sm'
                        : 'bg-neutral-bg/60 dark:bg-surface-elevated/40 border-neutral-border dark:border-neutral-border opacity-40 grayscale'
                      }`}
                  >
                    <div
                      className={`h-11 w-11 rounded-2xl flex items-center justify-center font-bold text-sm ${earned ? 'bg-sun text-ink-navy shadow-sm' : 'bg-neutral-muted/20 text-neutral-muted'
                        }`}
                    >
                      <Award className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-ink dark:text-white">{badge.title}</h4>
                      <p className="text-[10px] text-neutral-muted mt-0.5 line-clamp-2">
                        {badge.description}
                      </p>
                    </div>
                    {earned ? (
                      <span className="text-[10px] font-bold text-mint">
                        Unlocked {formatDate(earned.earned_at)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-muted">Locked</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
