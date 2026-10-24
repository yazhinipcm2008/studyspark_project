import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Bell,
  Sparkles,
  Flame,
  CheckCircle2,
  Clock,
  BookOpen,
  Calendar,
  Layers,
  Settings,
  Headphones,
  Sliders,
  Award,
  Zap,
  ArrowRight,
  ChevronDown
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ambientAudio, AmbientSoundType } from '@/lib/ambientAudio'
import { formatTime } from '@/lib/utils'
import type { StudySession, StudyTask, Material } from '@/types/database'

type TimerMode = 'pomodoro' | 'short_break' | 'long_break' | 'deep_work' | 'custom'

interface TimerPreset {
  name: string
  focusMinutes: number
  breakMinutes: number
  label: string
}

const PRESETS: Record<string, TimerPreset> = {
  pomodoro: { name: 'Pomodoro', focusMinutes: 25, breakMinutes: 5, label: '25m Focus / 5m Break' },
  deep_work: { name: 'Deep Work', focusMinutes: 50, breakMinutes: 10, label: '50m Focus / 10m Break' },
  ultra: { name: 'Ultra Sprint', focusMinutes: 90, breakMinutes: 20, label: '90m Focus / 20m Break' },
}

const FOCUS_QUOTES = [
  "Deep focus produces extraordinary academic results.",
  "Small daily disciplines compound into academic mastery.",
  "Protect your attention; it is your most valuable asset.",
  "One concept at a time, one page at a time.",
  "Calm consistency outperforms intense cramming every single time."
]

export const FocusTimerPage: React.FC = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Timer Configuration State
  const [selectedPreset, setSelectedPreset] = useState<string>('pomodoro')
  const [isBreak, setIsBreak] = useState<boolean>(false)
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60)
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60)
  const [isRunning, setIsRunning] = useState<boolean>(false)

  // Pomodoro Cycles
  const [sessionsCompletedToday, setSessionsCompletedToday] = useState<number>(0)
  const [currentCycleIndex, setCurrentCycleIndex] = useState<number>(1) // 1 to 4
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null)

  // Subject and Task binding
  const [subject, setSubject] = useState<string>('General Studies')
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [availableTasks, setAvailableTasks] = useState<StudyTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [customGoal, setCustomGoal] = useState<string>('')

  // Distraction-Free Zen Mode
  const [isZenMode, setIsZenMode] = useState<boolean>(false)
  const [activeQuoteIndex, setActiveQuoteIndex] = useState<number>(0)

  // Ambient Sound Settings
  const [ambientSound, setAmbientSound] = useState<AmbientSoundType>('off')
  const [volume, setVolume] = useState<number>(50)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(true)

  // Statistics and History
  const [todayFocusMinutes, setTodayFocusMinutes] = useState<number>(0)
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)

  // Load User Subjects, Tasks & Session History
  const loadUserData = useCallback(async () => {
    if (!user) return
    setIsLoadingHistory(true)
    try {
      // 1. Fetch distinct subjects from materials
      const { data: mats } = await supabase
        .from('materials')
        .select('subject')
        .eq('user_id', user.id)

      const matSubjects = (mats || []).map(m => m.subject).filter(Boolean) as string[]
      const subjectSet = new Set(['General Studies', 'Mathematics', 'Computer Science', 'Physics', ...matSubjects])
      setAvailableSubjects(Array.from(subjectSet))

      // 2. Fetch pending study tasks
      const today = new Date().toISOString().split('T')[0]
      const { data: tasks } = await supabase
        .from('study_tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('scheduled_date', { ascending: true })
        .limit(10)

      if (tasks) setAvailableTasks(tasks)

      // 3. Fetch today's study sessions
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)

      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gte('started_at', startOfToday.toISOString())
        .order('started_at', { ascending: false })

      if (sessions) {
        setRecentSessions(sessions)
        const totalMins = sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
        setTodayFocusMinutes(totalMins)
        setSessionsCompletedToday(sessions.length)
      }
    } catch (err) {
      console.warn('Failed to load focus history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [user])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // Timer Tick
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (isRunning) {
      interval = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            handleTimerComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRunning, isBreak, totalSeconds, subject, selectedTaskId])

  // Handle Preset Changes
  const handleSelectPreset = (presetKey: string) => {
    setSelectedPreset(presetKey)
    setIsBreak(false)
    const preset = PRESETS[presetKey] || PRESETS.pomodoro
    const sec = preset.focusMinutes * 60
    setTotalSeconds(sec)
    setSecondsLeft(sec)
    setIsRunning(false)
  }

  // Handle Custom Duration
  const handleSetCustomMinutes = (mins: number) => {
    const valid = Math.max(1, Math.min(180, mins))
    setSelectedPreset('custom')
    setIsBreak(false)
    const sec = valid * 60
    setTotalSeconds(sec)
    setSecondsLeft(sec)
    setIsRunning(false)
  }

  // Start / Resume Timer
  const handleStartTimer = () => {
    if (!isRunning && !sessionStartTime) {
      setSessionStartTime(new Date())
    }
    setIsRunning(true)

    // Resume ambient sound if one was chosen
    if (ambientSound !== 'off' && !isMuted) {
      ambientAudio.playAmbient(ambientSound)
    }
  }

  // Pause Timer
  const handlePauseTimer = () => {
    setIsRunning(false)
    ambientAudio.stopAmbient()
  }

  // Reset Current Phase
  const handleResetTimer = () => {
    setIsRunning(false)
    setSecondsLeft(totalSeconds)
    setSessionStartTime(null)
    ambientAudio.stopAmbient()
  }

  // Log Real Study Session to Supabase
  const logStudySession = async (durationMinutes: number) => {
    if (!user || durationMinutes <= 0) return

    const now = new Date()
    const startedAt = sessionStartTime ? sessionStartTime.toISOString() : new Date(now.getTime() - durationMinutes * 60000).toISOString()
    const endedAt = now.toISOString()

    try {
      // 1. Insert to study_sessions
      const { error: sessionErr } = await supabase
        .from('study_sessions')
        .insert({
          user_id: user.id,
          task_id: selectedTaskId || null,
          subject: subject || 'General Studies',
          started_at: startedAt,
          ended_at: endedAt,
          duration_minutes: durationMinutes,
          source: 'timer',
        })

      if (sessionErr) throw sessionErr

      // 2. Award gamification points
      const pointsToAward = Math.max(10, Math.round(durationMinutes / 5) * 5)
      try {
        await supabase.from('points_ledger').insert({
          user_id: user.id,
          event_type: 'pomodoro_session',
          points: pointsToAward,
          notes: `Focused for ${durationMinutes} mins on ${subject}`,
        })
      } catch (ptsErr) {
        console.warn('Points ledger warning:', ptsErr)
      }

      // 3. Mark task completed if linked
      if (selectedTaskId) {
        await supabase
          .from('study_tasks')
          .update({ completed: true, completed_at: endedAt })
          .eq('id', selectedTaskId)
      }

      toast.success(`Session logged! +${pointsToAward} pts awarded for ${durationMinutes}m focus.`)
      loadUserData()
    } catch (err: any) {
      console.error('Failed to log focus session:', err)
      toast.error('Session recorded locally; will sync when online.')
    }
  }

  // Timer Completion Handler
  const handleTimerComplete = async () => {
    setIsRunning(false)
    ambientAudio.stopAmbient()

    if (chimeEnabled) {
      ambientAudio.playCompletionChime()
    }

    if (!isBreak) {
      // Focus session ended!
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      })

      const elapsedMinutes = Math.round(totalSeconds / 60)
      await logStudySession(elapsedMinutes)

      // Transition to Break
      const isLongBreak = currentCycleIndex % 4 === 0
      const breakMinutes = isLongBreak ? 15 : (PRESETS[selectedPreset]?.breakMinutes || 5)
      setIsBreak(true)
      setTotalSeconds(breakMinutes * 60)
      setSecondsLeft(breakMinutes * 60)
      setSessionStartTime(null)
      setCurrentCycleIndex(prev => prev + 1)

      toast.info(`Great focus session! Enjoy a ${breakMinutes}-minute ${isLongBreak ? 'long' : 'short'} break.`)
    } else {
      // Break session ended!
      setIsBreak(false)
      const focusMinutes = PRESETS[selectedPreset]?.focusMinutes || 25
      setTotalSeconds(focusMinutes * 60)
      setSecondsLeft(focusMinutes * 60)
      setSessionStartTime(null)

      toast.info('Break time complete! Ready for your next focus session?')
    }
  }

  // Skip Phase Early
  const handleSkipPhase = () => {
    setIsRunning(false)
    ambientAudio.stopAmbient()

    if (!isBreak) {
      // Optionally log elapsed minutes if focused for at least 3 minutes
      const elapsedSec = totalSeconds - secondsLeft
      const elapsedMins = Math.floor(elapsedSec / 60)
      if (elapsedMins >= 3) {
        logStudySession(elapsedMins)
      }

      // Switch to break
      const breakMinutes = PRESETS[selectedPreset]?.breakMinutes || 5
      setIsBreak(true)
      setTotalSeconds(breakMinutes * 60)
      setSecondsLeft(breakMinutes * 60)
    } else {
      // Switch back to focus
      setIsBreak(false)
      const focusMinutes = PRESETS[selectedPreset]?.focusMinutes || 25
      setTotalSeconds(focusMinutes * 60)
      setSecondsLeft(focusMinutes * 60)
    }
    setSessionStartTime(null)
  }

  // Ambient Sound Controls
  const handleSelectSound = (type: AmbientSoundType) => {
    setAmbientSound(type)
    if (type === 'off') {
      ambientAudio.stopAmbient()
    } else {
      setIsMuted(false)
      ambientAudio.setVolume(volume / 100)
      ambientAudio.playAmbient(type)
    }
  }

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol)
    ambientAudio.setVolume(newVol / 100)
  }

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false)
      ambientAudio.setVolume(volume / 100)
      if (ambientSound !== 'off') {
        ambientAudio.playAmbient(ambientSound)
      }
    } else {
      setIsMuted(true)
      ambientAudio.stopAmbient()
    }
  }

  // Keyboard Shortcuts (Space for toggle, F for Zen, Esc to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        if (isRunning) handlePauseTimer()
        else handleStartTimer()
      } else if (e.code === 'KeyF') {
        e.preventDefault()
        setIsZenMode(prev => !prev)
      } else if (e.code === 'KeyM') {
        e.preventDefault()
        handleToggleMute()
      } else if (e.code === 'Escape' && isZenMode) {
        e.preventDefault()
        setIsZenMode(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRunning, isZenMode, isMuted, volume, ambientSound])

  // Cycle motivational quotes
  useEffect(() => {
    const quoteInterval = setInterval(() => {
      setActiveQuoteIndex(prev => (prev + 1) % FOCUS_QUOTES.length)
    }, 15000)
    return () => clearInterval(quoteInterval)
  }, [])

  // Format Time Remaining
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const formattedTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  const progressPercent = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0

  // SVG Circular progress dimensions
  const circleRadius = 140
  const circleCircumference = 2 * Math.PI * circleRadius
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference

  // Daily goal calculation
  const dailyGoalMinutes = profile?.daily_goal_minutes || 120
  const dailyProgressPercent = Math.min(100, Math.round((todayFocusMinutes / dailyGoalMinutes) * 100))

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* ============================================================== */}
      {/* DISTRACTION-FREE FULLSCREEN ZEN MODE OVERLAY                    */}
      {/* ============================================================== */}
      {isZenMode && (
        <div className="fixed inset-0 z-50 bg-[#0E1426] text-[#F1F5FF] flex flex-col justify-between items-center p-6 sm:p-10 select-none animate-in fade-in duration-300">
          {/* Zen Top Bar */}
          <div className="w-full flex items-center justify-between max-w-4xl">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-coral animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-coral-400">
                Zen Focus Mode
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Sound Indicator */}
              <button
                onClick={handleToggleMute}
                className="p-2 rounded-xl bg-surface border border-neutral-border dark:border-neutral-800 text-neutral-muted hover:text-white transition-colors"
                title={isMuted ? 'Unmute Ambient Sound' : 'Mute Ambient Sound'}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-coral" />}
              </button>

              {/* Exit Zen Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsZenMode(false)}
                className="bg-surface border-neutral-border dark:border-neutral-800 text-white hover:bg-neutral-800"
              >
                <Minimize2 className="h-4 w-4 mr-1.5" /> Exit Zen (Esc)
              </Button>
            </div>
          </div>

          {/* Zen Center Display */}
          <div className="flex flex-col items-center justify-center my-auto space-y-6 text-center">
            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface border border-neutral-border dark:border-neutral-800 text-xs font-bold tracking-wide">
              <span className={`h-2 w-2 rounded-full ${isBreak ? 'bg-mint' : 'bg-coral'}`} />
              <span>{isBreak ? 'Break Time' : 'Deep Focus'}</span>
              <span className="text-neutral-muted">•</span>
              <span className="text-coral-400">{subject}</span>
            </div>

            {/* Huge Timer Digits */}
            <div className="relative flex items-center justify-center">
              {/* Glowing halo */}
              <div className="absolute -inset-8 bg-gradient-focus rounded-full blur-3xl opacity-20 animate-pulse pointer-events-none" />
              <span className="relative text-7xl sm:text-9xl font-black tracking-tight text-white font-mono drop-shadow-[0_4px_30px_rgba(255,107,87,0.35)]">
                {formattedTime}
              </span>
            </div>

            {/* Active Intention / Task */}
            {customGoal ? (
              <p className="text-sm sm:text-base font-semibold text-coral-200 max-w-md">
                “{customGoal}”
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-neutral-300 italic max-w-md transition-all duration-700">
                {FOCUS_QUOTES[activeQuoteIndex]}
              </p>
            )}

            {/* Quick Zen Controls */}
            <div className="flex items-center gap-4 pt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handleResetTimer}
                className="h-12 w-12 rounded-2xl bg-surface border-neutral-border dark:border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800"
                title="Reset timer"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>

              <button
                type="button"
                onClick={isRunning ? handlePauseTimer : handleStartTimer}
                className="h-16 w-16 rounded-3xl bg-gradient-focus text-ink-navy flex items-center justify-center shadow-soft hover:scale-105 active:scale-95 transition-transform"
                title={isRunning ? 'Pause (Space)' : 'Start (Space)'}
              >
                {isRunning ? <Pause className="h-7 w-7 text-ink-navy" /> : <Play className="h-7 w-7 ml-1 text-ink-navy" />}
              </button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipPhase}
                className="h-12 w-12 rounded-2xl bg-surface border-neutral-border dark:border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800"
                title="Skip to next phase"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Zen Bottom Bar: Shortcuts hint */}
          <div className="text-center text-[11px] text-neutral-400">
            Press <kbd className="px-1.5 py-0.5 rounded bg-surface border border-neutral-border dark:border-neutral-800 text-white font-mono">Space</kbd> to toggle,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-neutral-border dark:border-neutral-800 text-white font-mono">F</kbd> for Zen,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-neutral-border dark:border-neutral-800 text-white font-mono">M</kbd> to mute sound
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STANDARD HEADER & QUICK STATS                                  */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-coral text-ink-navy shadow-soft">
              <Clock className="h-5 w-5" />
            </span>
            Pomodoro & Focus Timer
          </h1>
          <p className="text-xs text-neutral-muted mt-1">
            Build uninterrupted deep work momentum and automatically record verified study sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsZenMode(true)}
            className="shadow-sm border-coral/30 text-coral hover:bg-coral-50 dark:hover:bg-coral-950/40"
          >
            <Maximize2 className="h-4 w-4 mr-1.5" /> Distraction-Free (F)
          </Button>
        </div>
      </div>

      {/* Daily Progress Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3.5 shadow-sm border-t-2 border-t-coral">
          <div className="h-11 w-11 rounded-2xl bg-coral-100 dark:bg-coral-950/60 text-coral-600 dark:text-coral-400 flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-muted uppercase tracking-wider">Today's Focus Time</p>
            <h4 className="text-xl font-extrabold text-ink dark:text-white">
              {Math.floor(todayFocusMinutes / 60)}h {todayFocusMinutes % 60}m
            </h4>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5 shadow-sm border-t-2 border-t-mint">
          <div className="h-11 w-11 rounded-2xl bg-mint-100 dark:bg-mint-950/60 text-mint-600 dark:text-mint-400 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-muted uppercase tracking-wider">Sessions Completed</p>
            <h4 className="text-xl font-extrabold text-ink dark:text-white">
              {sessionsCompletedToday} <span className="text-xs font-normal text-neutral-muted">logged</span>
            </h4>
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between gap-3.5 shadow-sm border-t-2 border-t-sun">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-sun-100 dark:bg-sun-950/60 text-sun-700 dark:text-sun-400 flex items-center justify-center flex-shrink-0">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-muted uppercase tracking-wider">Daily Goal Progress</p>
              <h4 className="text-xl font-extrabold text-ink dark:text-white">
                {dailyProgressPercent}%
              </h4>
            </div>
          </div>
          <div className="w-16">
            <Progress value={todayFocusMinutes} max={dailyGoalMinutes} indicatorClassName="bg-sun" />
          </div>
        </Card>
      </div>

      {/* ============================================================== */}
      {/* MAIN TIMER CARD & CONTROLS                                     */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Timer Display */}
        <Card className="lg:col-span-2 p-6 sm:p-8 flex flex-col items-center justify-between shadow-card relative overflow-hidden">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <Button
              variant={selectedPreset === 'pomodoro' && !isBreak ? 'coral' : 'outline'}
              size="sm"
              onClick={() => handleSelectPreset('pomodoro')}
              className="text-xs rounded-xl"
            >
              25m Pomodoro
            </Button>
            <Button
              variant={selectedPreset === 'deep_work' && !isBreak ? 'coral' : 'outline'}
              size="sm"
              onClick={() => handleSelectPreset('deep_work')}
              className="text-xs rounded-xl"
            >
              50m Deep Work
            </Button>
            <Button
              variant={selectedPreset === 'ultra' && !isBreak ? 'coral' : 'outline'}
              size="sm"
              onClick={() => handleSelectPreset('ultra')}
              className="text-xs rounded-xl"
            >
              90m Ultra
            </Button>
            <Button
              variant={isBreak ? 'coral' : 'outline'}
              size="sm"
              onClick={() => {
                setIsBreak(true)
                setTotalSeconds(5 * 60)
                setSecondsLeft(5 * 60)
                setIsRunning(false)
              }}
              className="text-xs rounded-xl"
            >
              5m Break
            </Button>
          </div>

          {/* SVG Circular Timer Ring with Coral-to-Sun Gradient */}
          <div className="relative flex items-center justify-center my-4">
            <svg className="w-72 h-72 sm:w-80 sm:h-80 -rotate-90">
              {/* Background Ring */}
              <circle
                cx="50%"
                cy="50%"
                r={circleRadius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="12"
                className="text-neutral-border dark:text-neutral-800"
              />
              {/* Progress Ring with Coral-to-Sun Gradient (#FF6B57 to #FFB400) */}
              <circle
                cx="50%"
                cy="50%"
                r={circleRadius}
                fill="transparent"
                stroke="url(#timerGradient)"
                strokeWidth="12"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF6B57" />
                  <stop offset="100%" stopColor="#FFB400" />
                </linearGradient>
              </defs>
            </svg>

            {/* Inner Content inside circle */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className={`text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full mb-1 ${
                isBreak
                  ? 'bg-mint-100 text-mint-700 dark:bg-mint-950/60 dark:text-mint'
                  : 'bg-coral-100 text-coral-700 dark:bg-coral-950/60 dark:text-coral'
              }`}>
                {isBreak ? 'Rest & Recharge' : 'Focus Session'}
              </span>

              <h2 className="text-5xl sm:text-6xl font-black text-ink dark:text-white font-mono tracking-tight my-1">
                {formattedTime}
              </h2>

              <p className="text-xs font-semibold text-neutral-muted">
                {subject}
              </p>

              <span className="text-[10px] text-neutral-muted mt-1">
                Cycle {((currentCycleIndex - 1) % 4) + 1} of 4
              </span>
            </div>
          </div>

          {/* Main Action Buttons */}
          <div className="flex items-center gap-4 mt-6">
            <Button
              variant="outline"
              size="icon"
              onClick={handleResetTimer}
              className="h-11 w-11 rounded-2xl"
              title="Reset Timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={isRunning ? handlePauseTimer : handleStartTimer}
              className="px-8 py-3.5 rounded-2xl bg-gradient-focus text-ink-navy font-extrabold text-sm shadow-soft hover:opacity-95 active:scale-95 transition-all flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Pause className="h-5 w-5 text-ink-navy" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 text-ink-navy" /> Start Focus
                </>
              )}
            </button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleSkipPhase}
              className="h-11 w-11 rounded-2xl"
              title="Skip to next phase"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Right Col: Session Context & Ambient Sounds */}
        <div className="space-y-6">
          {/* Session Subject & Task Binding */}
          <Card className="p-5 space-y-4 shadow-sm border-t-2 border-t-coral">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-coral" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
                Session Target
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink dark:text-neutral-200 block mb-1">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface px-3 py-2 text-xs text-ink dark:text-white"
                >
                  {availableSubjects.map(sub => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              {availableTasks.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-ink dark:text-neutral-200 block mb-1">
                    Link to Study Plan Task (Optional)
                  </label>
                  <select
                    value={selectedTaskId}
                    onChange={e => {
                      setSelectedTaskId(e.target.value)
                      const t = availableTasks.find(task => task.id === e.target.value)
                      if (t?.subject) setSubject(t.subject)
                    }}
                    className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface px-3 py-2 text-xs text-ink dark:text-white truncate"
                  >
                    <option value="">None (Independent session)</option>
                    {availableTasks.map(task => (
                      <option key={task.id} value={task.id}>
                        {task.topic} ({task.subject})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-ink dark:text-neutral-200 block mb-1">
                  Session Goal or Notes
                </label>
                <Input
                  value={customGoal}
                  onChange={e => setCustomGoal(e.target.value)}
                  placeholder="e.g. Finish lecture 4 problem set"
                  className="text-xs"
                />
              </div>
            </div>
          </Card>

          {/* Ambient Soundscapes */}
          <Card className="p-5 space-y-4 shadow-sm border-t-2 border-t-coral">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-coral" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
                  Ambient Sounds
                </h3>
              </div>
              <button
                onClick={handleToggleMute}
                className="text-neutral-muted hover:text-ink dark:hover:text-white"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-coral" />}
              </button>
            </div>

            {/* Sound Selector Chips */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectSound('rain')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'rain' && !isMuted
                    ? 'border-coral bg-coral-50 dark:bg-coral-950/40 text-coral font-bold shadow-soft'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                🌧️ Rain Sounds
              </button>

              <button
                type="button"
                onClick={() => handleSelectSound('whitenoise')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'whitenoise' && !isMuted
                    ? 'border-coral bg-coral-50 dark:bg-coral-950/40 text-coral font-bold shadow-soft'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                🌊 Deep Brown Noise
              </button>

              <button
                type="button"
                onClick={() => handleSelectSound('binaural')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'binaural' && !isMuted
                    ? 'border-coral bg-coral-50 dark:bg-coral-950/40 text-coral font-bold shadow-soft'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                🧠 Alpha Waves (10Hz)
              </button>

              <button
                type="button"
                onClick={() => handleSelectSound('forest')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'forest' && !isMuted
                    ? 'border-coral bg-coral-50 dark:bg-coral-950/40 text-coral font-bold shadow-soft'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                🌲 Forest Breeze
              </button>

              <button
                type="button"
                onClick={() => handleSelectSound('cafe')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'cafe' && !isMuted
                    ? 'border-coral bg-coral-50 dark:bg-coral-950/40 text-coral font-bold shadow-soft'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                ☕ Cafe Warmth
              </button>

              <button
                type="button"
                onClick={() => handleSelectSound('off')}
                className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                  ambientSound === 'off' || isMuted
                    ? 'border-neutral-muted bg-neutral-100 dark:bg-neutral-800 text-neutral-muted font-bold'
                    : 'border-neutral-border dark:border-neutral-800 hover:border-coral-300'
                }`}
              >
                🔇 Silence (Off)
              </button>
            </div>

            {/* Volume Slider */}
            {ambientSound !== 'off' && (
              <div className="space-y-1 pt-2 border-t border-neutral-border dark:border-neutral-800">
                <div className="flex justify-between text-[11px] text-neutral-muted font-semibold">
                  <span>Ambient Volume</span>
                  <span>{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={e => handleVolumeChange(Number(e.target.value))}
                  className="w-full accent-coral h-1.5 rounded-lg cursor-pointer bg-neutral-border dark:bg-neutral-800"
                />
              </div>
            )}

            {/* Completion Chime Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-border dark:border-neutral-800 text-xs">
              <span className="text-neutral-muted flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-coral" /> End-of-Timer Bell Chime
              </span>
              <input
                type="checkbox"
                checked={chimeEnabled}
                onChange={e => setChimeEnabled(e.target.checked)}
                className="h-4 w-4 rounded accent-coral cursor-pointer"
              />
            </div>
          </Card>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RECENT FOCUS SESSIONS LOG                                      */}
      {/* ============================================================== */}
      <Card className="p-6 space-y-4 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-coral" />
            <h3 className="text-sm font-bold text-ink dark:text-white">
              Today's Logged Focus Sessions
            </h3>
          </div>
          <Badge variant="coral" className="text-xs font-semibold">
            {recentSessions.length} sessions logged
          </Badge>
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-8 text-neutral-muted">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40 text-coral" />
            <p className="text-xs">No focus sessions recorded today yet.</p>
            <p className="text-[11px] mt-0.5">Start your first 25-minute Pomodoro above to earn study points and streak credit!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-border dark:border-neutral-800 text-neutral-muted uppercase tracking-wider font-bold text-[10px]">
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Completed At</th>
                  <th className="py-2.5 px-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border dark:divide-neutral-800">
                {recentSessions.map(session => (
                  <tr key={session.id} className="hover:bg-neutral-bg/60 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-ink dark:text-white">
                      {session.subject}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-coral">
                      {session.duration_minutes} mins
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="capitalize px-2 py-0.5 rounded-full bg-neutral-bg dark:bg-neutral-800 text-neutral-muted text-[10px] font-semibold">
                        {session.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-muted">
                      {new Date(session.ended_at || session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-sun-600 dark:text-sun-400">
                      +{Math.max(10, Math.round((session.duration_minutes || 25) / 5) * 5)} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
