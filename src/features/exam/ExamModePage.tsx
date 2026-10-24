import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GraduationCap,
  Clock,
  AlertTriangle,
  Flag,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  BookOpen,
  Award,
  BarChart3,
  Sliders,
  Check,
  FileText,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  Timer
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  generateMultiMaterialExam,
  ExamSimulationQuestion
} from '@/lib/examSimulationEngine'
import { MaterialPassageViewerModal } from '@/components/materials/MaterialPassageViewerModal'
import { ambientAudio } from '@/lib/ambientAudio'
import type { Material, ExamSimulationAttempt, ExamQuestionResult } from '@/types/database'

type ExamView = 'setup' | 'active' | 'results'

interface PresetConfig {
  id: string
  name: string
  questions: number
  minutes: number
  description: string
  badge: string
}

const EXAM_PRESETS: PresetConfig[] = [
  {
    id: 'sprint',
    name: 'Sprint Mock',
    questions: 15,
    minutes: 20,
    description: 'Quick active recall assessment across key materials',
    badge: '15 Questions • 20 Mins',
  },
  {
    id: 'midterm',
    name: 'Standard Midterm',
    questions: 25,
    minutes: 35,
    description: 'Realistic timed exam block testing multi-chapter proficiency',
    badge: '25 Questions • 35 Mins',
  },
  {
    id: 'final',
    name: 'Comprehensive Final',
    questions: 40,
    minutes: 60,
    description: 'Full-length, rigorous exam simulation spanning all chosen notes',
    badge: '40 Questions • 60 Mins',
  },
]

export const ExamModePage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Navigation / Page View State
  const [view, setView] = useState<ExamView>('setup')

  // Setup Configuration State
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('midterm')
  const [customQuestions, setCustomQuestions] = useState<number>(25)
  const [customMinutes, setCustomMinutes] = useState<number>(35)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isLoadingMaterials, setIsLoadingMaterials] = useState<boolean>(true)

  // Active Exam Simulation State
  const [examTitle, setExamTitle] = useState<string>('Multi-Material Exam Simulation')
  const [questions, setQuestions] = useState<ExamSimulationQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<Record<string, string>>({}) // question_id -> option
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(new Set())
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(35 * 60)
  const [totalAllottedSeconds, setTotalAllottedSeconds] = useState<number>(35 * 60)
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<string, number>>({}) // question_id -> seconds
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState<boolean>(false)

  // Results State
  const [examAttempt, setExamAttempt] = useState<ExamSimulationAttempt | null>(null)
  const [resultsFilter, setResultsFilter] = useState<'all' | 'incorrect' | 'flagged'>('all')

  // Citation modal
  const [viewingCitation, setViewingCitation] = useState<{
    materialId?: string | null
    materialTitle?: string | null
    passage?: string | null
    pageNumber?: number | null
  } | null>(null)

  // 1. Load user materials on mount
  useEffect(() => {
    if (!user) return
    const loadMaterials = async () => {
      setIsLoadingMaterials(true)
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setMaterials(data || [])
        // Select all by default
        if (data && data.length > 0) {
          setSelectedMaterialIds(data.map(m => m.id))
        }
      } catch (err: any) {
        console.error('Failed to load materials:', err)
        toast.error('Failed to load study materials')
      } finally {
        setIsLoadingMaterials(false)
      }
    }
    loadMaterials()
  }, [user])

  // 2. Active Exam Timer & Per-Question Time Accumulator
  useEffect(() => {
    if (view !== 'active') return

    const timer = setInterval(() => {
      setTimeRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleFinalizeExam(true) // Auto-submit on expiration
          return 0
        }
        return prev - 1
      })

      // Track active seconds on current question
      const currentQ = questions[currentIndex]
      if (currentQ) {
        setQuestionTimeSpent(prev => ({
          ...prev,
          [currentQ.id]: (prev[currentQ.id] || 0) + 1,
        }))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [view, currentIndex, questions])

  // Material Toggle Helper
  const handleToggleMaterial = (id: string) => {
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
    )
  }

  const handleSelectAllMaterials = () => {
    if (selectedMaterialIds.length === materials.length) {
      setSelectedMaterialIds([])
    } else {
      setSelectedMaterialIds(materials.map(m => m.id))
    }
  }

  // Launch Exam Simulation
  const handleStartExam = async () => {
    if (selectedMaterialIds.length === 0) {
      toast.error('Please select at least one material for the exam.')
      return
    }

    const preset = EXAM_PRESETS.find(p => p.id === selectedPresetId)
    const numQ = preset ? preset.questions : customQuestions
    const durationMin = preset ? preset.minutes : customMinutes

    setIsGenerating(true)
    try {
      const generated = await generateMultiMaterialExam({
        userId: user!.id,
        materialIds: selectedMaterialIds,
        totalQuestions: numQ,
      })

      setQuestions(generated.questions)
      setExamTitle(generated.title)
      setCurrentIndex(0)
      setAnswers({})
      setFlaggedQuestionIds(new Set())
      setQuestionTimeSpent({})
      const totalSec = durationMin * 60
      setTotalAllottedSeconds(totalSec)
      setTimeRemainingSeconds(totalSec)
      setView('active')

      toast.success(`Exam started! You have ${durationMin} minutes for ${generated.questions.length} questions.`)
    } catch (err: any) {
      console.error('Failed to start exam:', err)
      toast.error(err.message || 'Could not generate exam from chosen materials.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Toggle Flag Question
  const handleToggleFlag = (qId: string) => {
    setFlaggedQuestionIds(prev => {
      const next = new Set(prev)
      if (next.has(qId)) next.delete(qId)
      else next.add(qId)
      return next
    })
  }

  // Keyboard navigation inside active exam
  useEffect(() => {
    if (view !== 'active') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      const currentQ = questions[currentIndex]
      if (!currentQ) return

      // Option selection by letter A, B, C, D
      if (['KeyA', 'KeyB', 'KeyC', 'KeyD'].includes(e.code)) {
        const optionIdx = e.code.charCodeAt(3) - 65
        if (currentQ.options[optionIdx]) {
          setAnswers(prev => ({ ...prev, [currentQ.id]: currentQ.options[optionIdx] }))
        }
      } else if (e.code === 'ArrowRight' && currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else if (e.code === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, currentIndex, questions])

  // Finalize & Score Exam
  const handleFinalizeExam = async (isAutoSubmit = false) => {
    setIsConfirmSubmitOpen(false)
    ambientAudio.playCompletionChime()

    const timeSpentTotal = totalAllottedSeconds - timeRemainingSeconds
    const totalQ = questions.length

    let correctCount = 0
    const topicBreakdown: Record<string, { total: number; correct: number; total_time_seconds: number }> = {}

    const questionResults: ExamQuestionResult[] = questions.map((q, idx) => {
      const selected = answers[q.id] || ''
      const isCorrect = selected.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
      if (isCorrect) correctCount++

      const timeSec = questionTimeSpent[q.id] || 0
      const topic = q.topic || 'General'

      if (!topicBreakdown[topic]) {
        topicBreakdown[topic] = { total: 0, correct: 0, total_time_seconds: 0 }
      }
      topicBreakdown[topic].total += 1
      if (isCorrect) topicBreakdown[topic].correct += 1
      topicBreakdown[topic].total_time_seconds += timeSec

      return {
        question_id: q.id,
        position: idx + 1,
        question_text: q.question_text,
        options: q.options,
        selected_answer: selected,
        correct_answer: q.correct_answer,
        is_correct: isCorrect,
        topic,
        material_id: q.material_id,
        material_title: q.material_title,
        time_spent_seconds: timeSec,
        explanation: q.explanation,
        flagged: flaggedQuestionIds.has(q.id),
      }
    })

    const scorePercent = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0

    const attemptPayload: ExamSimulationAttempt = {
      id: crypto.randomUUID(),
      user_id: user?.id || '',
      title: examTitle,
      material_ids: selectedMaterialIds,
      total_questions: totalQ,
      time_limit_minutes: Math.round(totalAllottedSeconds / 60),
      duration_seconds: timeSpentTotal,
      score_percent: scorePercent,
      correct_count: correctCount,
      started_at: new Date(Date.now() - timeSpentTotal * 1000).toISOString(),
      completed_at: new Date().toISOString(),
      topic_breakdown: topicBreakdown,
      question_results: questionResults,
    }

    setExamAttempt(attemptPayload)
    setView('results')

    // Confetti celebration if passing
    if (scorePercent >= 70) {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      })
    }

    if (isAutoSubmit) {
      toast.warning('Time expired! Your exam was automatically submitted and scored.')
    } else {
      toast.success('Exam submitted successfully!')
    }

    // 1. Record real study session in Supabase for streak & time analytics
    try {
      const elapsedMins = Math.max(1, Math.round(timeSpentTotal / 60))
      await supabase.from('study_sessions').insert({
        user_id: user!.id,
        subject: questions[0]?.topic || 'Exam Simulation',
        duration_minutes: elapsedMins,
        started_at: attemptPayload.started_at,
        ended_at: attemptPayload.completed_at,
        source: 'timer',
      })

      // 2. Award Points
      const pointsToAward = Math.max(25, Math.round(scorePercent * 0.75))
      await supabase.from('points_ledger').insert({
        user_id: user!.id,
        event_type: 'exam_simulation_completed',
        points: pointsToAward,
        notes: `Exam Simulation: ${scorePercent}% on ${totalQ} questions`,
      })
    } catch (saveErr) {
      console.warn('Logging error:', saveErr)
    }
  }

  // Format Timer String
  const formatTimerDigits = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Letter Grade Helper
  const getLetterGrade = (pct: number) => {
    if (pct >= 93) return { grade: 'A+', color: 'text-mint', desc: 'Superior Mastery' }
    if (pct >= 85) return { grade: 'A', color: 'text-mint', desc: 'Mastery' }
    if (pct >= 75) return { grade: 'B+', color: 'text-blue', desc: 'Proficient' }
    if (pct >= 65) return { grade: 'B', color: 'text-blue', desc: 'Solid Foundation' }
    if (pct >= 55) return { grade: 'C', color: 'text-sun', desc: 'Needs Review' }
    return { grade: 'F', color: 'text-coral', desc: 'Critical Practice Required' }
  }

  // ====================================================================
  // 1. SETUP VIEW: Configuration & Material Selection
  // ====================================================================
  if (view === 'setup') {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        {/* Hero Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2.5">
              <span className="p-2 rounded-2xl bg-sun text-ink-navy shadow-sm">
                <GraduationCap className="h-6 w-6" />
              </span>
              Exam Simulation Mode
            </h1>
            <p className="text-xs text-neutral-muted mt-1">
              Timed, zero-hint collegiate test simulations drawn across multiple materials with comprehensive diagnostic breakdown.
            </p>
          </div>
        </div>

        {/* Simulation Rules Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="p-4 bg-sun-500/10 dark:bg-sun-500/20 border-sun-300 dark:border-sun-700/50 space-y-1.5 shadow-sm">
            <div className="flex items-center gap-2 text-sun-700 dark:text-sun font-bold text-xs uppercase tracking-wider">
              <Clock className="h-4 w-4" /> Strict Timer
            </div>
            <p className="text-xs text-neutral-muted">
              Official countdown timer. Automatic submission on expiration to mirror real exam pacing.
            </p>
          </Card>

          <Card className="p-4 bg-coral-500/10 dark:bg-coral-500/20 border-coral-300 dark:border-coral-700/50 space-y-1.5 shadow-sm">
            <div className="flex items-center gap-2 text-coral font-bold text-xs uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" /> Zero Hints
            </div>
            <p className="text-xs text-neutral-muted">
              Explanations and correct answers are locked until submission. Includes question flagging.
            </p>
          </Card>

          <Card className="p-4 bg-blue-500/10 dark:bg-blue-500/20 border-blue-300 dark:border-blue-700/50 space-y-1.5 shadow-sm">
            <div className="flex items-center gap-2 text-blue font-bold text-xs uppercase tracking-wider">
              <BarChart3 className="h-4 w-4" /> Diagnostics
            </div>
            <p className="text-xs text-neutral-muted">
              Deep post-exam metrics measuring accuracy per topic and exact time spent per question.
            </p>
          </Card>
        </div>

        {/* Preset Selector */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
            1. Select Exam Simulation Format
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {EXAM_PRESETS.map(preset => {
              const isSelected = selectedPresetId === preset.id
              return (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-sun bg-sun-50/50 dark:bg-sun-950/30'
                      : 'border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated hover:border-sun'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-ink dark:text-white">
                        {preset.name}
                      </span>
                      <Badge variant={isSelected ? 'sun' : 'outline'} className="text-[10px]">
                        {preset.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-neutral-muted leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-neutral-border dark:border-neutral-border text-[11px] font-semibold text-sun-700 dark:text-sun flex items-center justify-between">
                    <span>Target: ~{Math.round((preset.minutes * 60) / preset.questions)}s / question</span>
                    {isSelected && <Check className="h-4 w-4 text-sun" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Material Multi-Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
                2. Select Study Materials to Mix
              </h2>
              <p className="text-xs text-neutral-muted">
                Questions will be synthesized and balanced evenly across the selected materials.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSelectAllMaterials} className="text-xs">
              {selectedMaterialIds.length === materials.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          {isLoadingMaterials ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : materials.length === 0 ? (
            <Card className="p-6 text-center text-neutral-muted space-y-2">
              <BookOpen className="h-8 w-8 mx-auto text-sky opacity-60" />
              <p className="text-sm font-semibold text-ink dark:text-white">No Study Materials Found</p>
              <p className="text-xs max-w-sm mx-auto">
                Upload course notes or past exam summaries in Study Materials first to generate an exam simulation.
              </p>
              <Button variant="sky" size="sm" className="mt-2" onClick={() => navigate('/materials')}>
                Upload Materials
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {materials.map(mat => {
                const isSelected = selectedMaterialIds.includes(mat.id)
                return (
                  <div
                    key={mat.id}
                    onClick={() => handleToggleMaterial(mat.id)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isSelected
                        ? 'border-sun bg-sun-50/70 dark:bg-sun-950/40'
                        : 'border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated hover:border-sun'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by div
                      className="mt-1 h-4 w-4 rounded accent-sun cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-ink dark:text-white truncate">
                        {mat.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-muted">
                        <span className="capitalize">{mat.subject || 'General'}</span>
                        <span>•</span>
                        <span>{(mat.text_length || 0).toLocaleString()} chars</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Start Button */}
        <div className="pt-4 flex justify-end">
          <Button
            variant="sun"
            size="lg"
            disabled={selectedMaterialIds.length === 0 || isGenerating}
            isLoading={isGenerating}
            onClick={handleStartExam}
            className="w-full sm:w-auto px-8"
          >
            Launch Exam Simulation <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // 2. ACTIVE EXAM VIEW: Strict Timed Examination Screen
  // ====================================================================
  if (view === 'active') {
    const currentQuestion = questions[currentIndex]
    const answeredCount = Object.keys(answers).length
    const totalQ = questions.length
    const currentQTime = questionTimeSpent[currentQuestion?.id] || 0

    // Urgent timer alert
    const isUnder5Minutes = timeRemainingSeconds <= 5 * 60
    const isUnder1Minute = timeRemainingSeconds <= 60

    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12 select-none">
        {/* Top Bar: Exam Title, Timer, Finish Button */}
        <div className="p-4 rounded-3xl bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-sun text-ink-navy shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink dark:text-white truncate max-w-xs sm:max-w-md">
                {examTitle}
              </h2>
              <p className="text-[11px] text-neutral-muted">
                Question {currentIndex + 1} of {totalQ} • {answeredCount} answered
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Urgent Countdown Timer */}
            <div
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-mono text-xs font-bold transition-all ${
                isUnder1Minute
                  ? 'bg-coral text-ink-navy animate-pulse'
                  : isUnder5Minutes
                  ? 'bg-sun text-ink-navy font-extrabold animate-bounce'
                  : 'bg-sun-50 dark:bg-sun-950/40 text-sun-700 dark:text-sun border border-sun-300 dark:border-sun-800'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{formatTimerDigits(timeRemainingSeconds)}</span>
            </div>

            <Button
              variant="sun"
              size="sm"
              onClick={() => setIsConfirmSubmitOpen(true)}
            >
              Submit Exam
            </Button>
          </div>
        </div>

        {/* Exam Split View: Question Card & Question Palette */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Question Card (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-6 sm:p-8 space-y-6 shadow-sm">
              {/* Question Header & Flag Toggle */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-border dark:border-neutral-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sun-700 dark:text-sun">
                      {currentQuestion.topic}
                    </span>
                    <span className="text-neutral-muted">•</span>
                    <span className="text-[11px] text-neutral-muted truncate max-w-xs">
                      {currentQuestion.material_title}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-ink dark:text-white leading-snug">
                    {currentQuestion.question_text}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleFlag(currentQuestion.id)}
                  className={`p-2 rounded-xl border transition-colors flex items-center gap-1 text-xs font-bold flex-shrink-0 ${
                    flaggedQuestionIds.has(currentQuestion.id)
                      ? 'border-coral bg-coral-50 dark:bg-coral-950/50 text-coral'
                      : 'border-neutral-border dark:border-neutral-border text-neutral-muted hover:text-ink'
                  }`}
                  title="Flag for review"
                >
                  <Flag className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {flaggedQuestionIds.has(currentQuestion.id) ? 'Flagged' : 'Flag'}
                  </span>
                </button>
              </div>

              {/* Multiple Choice Options */}
              <div className="space-y-3 pt-2">
                {currentQuestion.options.map((opt, i) => {
                  const isSelected = answers[currentQuestion.id] === opt
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-sun bg-sun-50/60 dark:bg-sun-950/40 text-ink dark:text-white font-semibold'
                          : 'border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated hover:border-sun text-ink dark:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-sun text-ink-navy'
                              : 'bg-neutral-bg dark:bg-surface text-neutral-muted'
                          }`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-sm leading-relaxed">{opt}</span>
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-sun flex-shrink-0 ml-2" />}
                    </button>
                  )
                })}
              </div>

              {/* Navigation Footer */}
              <div className="flex items-center justify-between pt-6 border-t border-neutral-border dark:border-neutral-border">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
                </Button>

                <span className="text-xs font-semibold text-neutral-muted">
                  Time on Question: <span className="font-mono text-sun-700 dark:text-sun font-bold">{formatTimerDigits(currentQTime)}</span>
                </span>

                {currentIndex < totalQ - 1 ? (
                  <Button
                    variant="sun"
                    size="sm"
                    onClick={() => setCurrentIndex(prev => prev + 1)}
                  >
                    Next <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                ) : (
                  <Button
                    variant="sun"
                    size="sm"
                    onClick={() => setIsConfirmSubmitOpen(true)}
                  >
                    Review & Submit
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Question Palette Drawer */}
          <div className="space-y-4">
            <Card className="p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-border dark:border-neutral-border">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
                  Question Palette
                </span>
                <span className="text-xs font-bold text-sun-700 dark:text-sun">
                  {answeredCount}/{totalQ} Done
                </span>
              </div>

              {/* Palette Legend */}
              <div className="flex items-center justify-between text-[10px] text-neutral-muted font-medium">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sun" /> Answered
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-coral" /> Flagged
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full border border-neutral-muted" /> Empty
                </span>
              </div>

              {/* Question Grid Buttons */}
              <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
                {questions.map((q, idx) => {
                  const isCurrent = currentIndex === idx
                  const isAnswered = Boolean(answers[q.id])
                  const isFlagged = flaggedQuestionIds.has(q.id)

                  return (
                    <button
                      type="button"
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-9 rounded-xl text-xs font-bold relative flex items-center justify-center transition-all ${
                        isCurrent
                          ? 'ring-2 ring-sun ring-offset-2 ring-offset-white dark:ring-offset-surface font-black'
                          : ''
                      } ${
                        isAnswered
                          ? 'bg-sun text-ink-navy shadow-sm'
                          : 'bg-neutral-bg dark:bg-surface text-neutral-muted hover:text-ink hover:bg-neutral-200'
                      }`}
                    >
                      <span>{idx + 1}</span>
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-coral text-white flex items-center justify-center text-[8px]">
                          🚩
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="pt-2 border-t border-neutral-border dark:border-neutral-border text-center">
                <p className="text-[10px] text-neutral-muted">
                  Use keys <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-surface-elevated font-mono">A</kbd>,{' '}
                  <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-ink-800 font-mono">B</kbd>,{' '}
                  <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-ink-800 font-mono">C</kbd>,{' '}
                  <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-ink-800 font-mono">D</kbd> to select
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Submission Confirmation Dialog */}
        <Dialog
          open={isConfirmSubmitOpen}
          onClose={() => setIsConfirmSubmitOpen(false)}
          title="Submit Exam Simulation?"
          description={`You have completed ${answeredCount} of ${totalQ} questions. ${flaggedQuestionIds.size} questions are flagged for review. Once submitted, your score and detailed time breakdown will be finalized.`}
          confirmText="Yes, Finalize & Score"
          confirmVariant="primary"
          onConfirm={() => handleFinalizeExam(false)}
        />
      </div>
    )
  }

  // ====================================================================
  // 3. RESULTS VIEW: In-Depth Diagnostic Breakdown & Analytics
  // ====================================================================
  if (view === 'results' && examAttempt) {
    const { score_percent, correct_count, total_questions, duration_seconds, topic_breakdown, question_results } = examAttempt
    const letterGrade = getLetterGrade(score_percent)
    const avgSecondsPerQuestion = total_questions > 0 ? Math.round(duration_seconds / total_questions) : 0

    // Filter results
    const filteredResults = question_results.filter(qr => {
      if (resultsFilter === 'incorrect') return !qr.is_correct
      if (resultsFilter === 'flagged') return qr.flagged
      return true
    })

    // Outlier hesitation analysis (> 2x average)
    const hesitationQuestions = question_results.filter(qr => qr.time_spent_seconds >= avgSecondsPerQuestion * 2)

    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-16">
        {/* Score & Mastery Hero Banner */}
        <div className={`rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-sm ${
          score_percent >= 80
            ? 'bg-gradient-hero text-white'
            : score_percent >= 60
            ? 'bg-gradient-streak text-ink-navy'
            : 'bg-gradient-focus text-ink-navy'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/10 dark:bg-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                <Award className="h-3.5 w-3.5" />
                Exam Simulation Performance
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
                {score_percent}% Score
              </h1>
              <p className="text-sm opacity-90">
                You answered {correct_count} of {total_questions} questions correctly in {Math.floor(duration_seconds / 60)}m {duration_seconds % 60}s.
              </p>
            </div>

            {/* Letter Grade & Action */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3">
              <div className="p-4 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur-md text-center border border-white/20">
                <span className="text-3xl sm:text-4xl font-black">{letterGrade.grade}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider mt-0.5 opacity-80">
                  {letterGrade.desc}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-ink hover:bg-white/90 border-transparent shadow-sm font-bold"
                onClick={() => setView('setup')}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Retake Another Exam
              </Button>
            </div>
          </div>
        </div>

        {/* 3 Metric Snapshot Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-neutral-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Average Pacing</span>
              <Timer className="h-4 w-4 text-blue" />
            </div>
            <h4 className="text-2xl font-black text-ink dark:text-white font-mono">
              {formatTimerDigits(avgSecondsPerQuestion)}
            </h4>
            <p className="text-[11px] text-neutral-muted">Target was ~{Math.round((examAttempt.time_limit_minutes * 60) / total_questions)}s / question</p>
          </Card>

          <Card className="p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-neutral-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Hesitation Questions</span>
              <AlertTriangle className="h-4 w-4 text-coral" />
            </div>
            <h4 className="text-2xl font-black text-ink dark:text-white font-mono">
              {hesitationQuestions.length}
            </h4>
            <p className="text-[11px] text-neutral-muted">Took over 2x average duration</p>
          </Card>

          <Card className="p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-neutral-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Points Earned</span>
              <Sparkles className="h-4 w-4 text-sun" />
            </div>
            <h4 className="text-2xl font-black text-sun font-mono">
              +{Math.max(25, Math.round(score_percent * 0.75))} pts
            </h4>
            <p className="text-[11px] text-neutral-muted">Added to leaderboard and streak</p>
          </Card>
        </div>

        {/* ============================================================ */}
        {/* TOPIC-BY-TOPIC DIAGNOSTIC BREAKDOWN                          */}
        {/* ============================================================ */}
        <Card className="p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue" />
              <h2 className="text-base font-extrabold text-ink dark:text-white">
                Diagnostic Breakdown by Topic
              </h2>
            </div>
            <span className="text-xs font-semibold text-neutral-muted">
              {Object.keys(topic_breakdown).length} topics analyzed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {Object.entries(topic_breakdown).map(([topic, stats]) => {
              const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
              const avgTime = stats.total > 0 ? Math.round(stats.total_time_seconds / stats.total) : 0

              return (
                <div
                  key={topic}
                  className="p-4 rounded-2xl bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink dark:text-white truncate max-w-[200px]">
                      {topic}
                    </span>
                    <Badge variant={pct >= 80 ? 'easy' : pct >= 60 ? 'medium' : 'hard'}>
                      {pct}% ({stats.correct}/{stats.total})
                    </Badge>
                  </div>
                  <Progress value={stats.correct} max={stats.total} />
                  <div className="flex items-center justify-between text-[11px] text-neutral-muted pt-1">
                    <span>Average Pacing:</span>
                    <span className="font-mono font-semibold text-blue">{avgTime}s / question</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ============================================================ */}
        {/* TIME SPENT PER QUESTION VISUALIZER                           */}
        {/* ============================================================ */}
        <Card className="p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue" />
              <div>
                <h2 className="text-base font-extrabold text-ink dark:text-white">
                  Time Spent Per Question (Pacing Curve)
                </h2>
                <p className="text-xs text-neutral-muted">
                  Spot hesitation outliers and examine time allocation across questions.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-neutral-muted">
              Avg: {avgSecondsPerQuestion}s
            </span>
          </div>

          {/* Bar Chart Representation */}
          <div className="pt-4 space-y-2">
            <div className="h-36 flex items-end gap-1.5 sm:gap-2 px-2 overflow-x-auto pb-2 border-b border-neutral-border dark:border-neutral-border">
              {question_results.map(qr => {
                const maxSec = Math.max(...question_results.map(q => q.time_spent_seconds), 60)
                const barHeight = Math.max(12, Math.round((qr.time_spent_seconds / maxSec) * 110))
                const isHesitation = qr.time_spent_seconds >= avgSecondsPerQuestion * 2

                return (
                  <div
                    key={qr.question_id}
                    className="flex-1 min-w-[20px] sm:min-w-[28px] flex flex-col items-center gap-1 group relative cursor-pointer"
                    onClick={() => {
                      // Smooth scroll down to question in audit list
                      const el = document.getElementById(`audit-q-${qr.position}`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }}
                  >
                    {/* Tooltip on Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-ink-950 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-lg">
                      Q{qr.position}: {qr.time_spent_seconds}s ({qr.is_correct ? 'Correct' : 'Incorrect'})
                    </div>

                    <div
                      style={{ height: `${barHeight}px` }}
                      className={`w-full rounded-t-lg transition-all group-hover:opacity-80 ${
                        qr.is_correct
                          ? 'bg-mint'
                          : 'bg-coral'
                      } ${isHesitation ? 'ring-2 ring-coral' : ''}`}
                    />
                    <span className="text-[10px] text-neutral-muted font-bold">
                      {qr.position}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-muted pt-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-mint" /> Correct
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-coral" /> Incorrect
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-coral" /> Hesitation (&gt;2x avg)
                </span>
              </div>
              <span>Click any bar to jump to question rationale</span>
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/* COMPREHENSIVE QUESTION-BY-QUESTION AUDIT REVIEW              */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-ink dark:text-white">
              Question-by-Question Audit & Rationales
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border text-xs">
              <button
                type="button"
                onClick={() => setResultsFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  resultsFilter === 'all'
                    ? 'bg-white dark:bg-surface text-ink dark:text-white shadow-sm'
                    : 'text-neutral-muted hover:text-ink'
                }`}
              >
                All ({question_results.length})
              </button>
              <button
                type="button"
                onClick={() => setResultsFilter('incorrect')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  resultsFilter === 'incorrect'
                    ? 'bg-white dark:bg-surface text-ink dark:text-white shadow-sm'
                    : 'text-neutral-muted hover:text-ink'
                }`}
              >
                Incorrect ({question_results.filter(q => !q.is_correct).length})
              </button>
              <button
                type="button"
                onClick={() => setResultsFilter('flagged')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  resultsFilter === 'flagged'
                    ? 'bg-white dark:bg-surface text-ink dark:text-white shadow-sm'
                    : 'text-neutral-muted hover:text-ink'
                }`}
              >
                Flagged ({question_results.filter(q => q.flagged).length})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredResults.map(qr => {
              const matchedQ = questions.find(q => q.id === qr.question_id)
              return (
                <Card key={qr.question_id} id={`audit-q-${qr.position}`} className="p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                          qr.is_correct ? 'bg-mint-100 text-mint-700 dark:bg-mint-950/60 dark:text-mint' : 'bg-coral-100 text-coral-700 dark:bg-coral-950/60 dark:text-coral'
                        }`}
                      >
                        {qr.position}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-sun-700 dark:text-sun uppercase tracking-wider">
                            {qr.topic}
                          </span>
                          <span className="text-neutral-muted">•</span>
                          <span className="text-[10px] text-neutral-muted truncate max-w-xs">
                            {qr.material_title}
                          </span>
                          {qr.flagged && (
                            <span className="text-[10px] text-coral font-bold flex items-center gap-0.5">
                              🚩 Flagged
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-extrabold text-ink dark:text-white leading-snug">
                          {qr.question_text}
                        </h4>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge variant={qr.is_correct ? 'easy' : 'hard'}>
                        {qr.is_correct ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Correct
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Incorrect
                          </>
                        )}
                      </Badge>
                      <span className="text-[11px] font-mono text-neutral-muted font-bold">
                        ⏱️ {qr.time_spent_seconds}s
                      </span>
                    </div>
                  </div>

                  {/* Answers Comparison */}
                  <div className="p-3.5 rounded-xl bg-neutral-bg dark:bg-surface-elevated text-xs space-y-1.5 border border-neutral-border dark:border-neutral-border">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-muted font-medium w-28">Your Answer:</span>
                      <span className={`font-bold ${qr.is_correct ? 'text-mint' : 'text-coral'}`}>
                        {qr.selected_answer || '(Unanswered)'}
                      </span>
                    </div>
                    {!qr.is_correct && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-muted font-medium w-28">Correct Answer:</span>
                        <span className="font-bold text-mint">{qr.correct_answer}</span>
                      </div>
                    )}
                  </div>

                  {/* Conceptual Explanation */}
                  {qr.explanation && (
                    <div className="text-xs text-neutral-muted leading-relaxed pl-2 border-l-2 border-sun">
                      <strong className="text-ink dark:text-neutral-200">Rationale: </strong>
                      {qr.explanation.replace(/\[Citation:[^\]]+\]/g, '').trim()}
                    </div>
                  )}

                  {/* Source Material Citation Link */}
                  {matchedQ?.source_passage && (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/60 dark:border-sky-800/60 text-xs">
                      <div className="flex items-center gap-1.5 text-sky font-semibold truncate">
                        <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Source: {qr.material_title} • Page {matchedQ.source_page || 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setViewingCitation({
                            materialId: qr.material_id,
                            materialTitle: qr.material_title,
                            passage: matchedQ.source_passage,
                            pageNumber: matchedQ.source_page || 1,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-bold text-sky hover:text-sky-700 dark:hover:text-sky-300 underline underline-offset-2 decoration-sky/40 hover:decoration-sky flex-shrink-0 cursor-pointer"
                      >
                        <span>View Highlighted Passage</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>

        {/* Material Passage Citation Modal */}
        <MaterialPassageViewerModal
          open={Boolean(viewingCitation)}
          onClose={() => setViewingCitation(null)}
          materialId={viewingCitation?.materialId}
          materialTitle={viewingCitation?.materialTitle}
          passage={viewingCitation?.passage}
          pageNumber={viewingCitation?.pageNumber}
        />
      </div>
    )
  }

  return null
}
