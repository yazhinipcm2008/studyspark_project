import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Clock,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  BookOpen,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { queueOutboxAction } from '@/lib/offline/outbox'
import { toast } from 'sonner'
import { sanitizeQuestions } from '@/lib/questionSanitizer'
import type { Quiz, QuizQuestion } from '@/types/database'
import { MaterialPassageViewerModal } from '@/components/materials/MaterialPassageViewerModal'

export const QuizTakingPage: React.FC = () => {
  const { id: quizId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({}) // question_id -> selected_answer
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Passage viewer modal state
  const [viewingCitation, setViewingCitation] = useState<{
    materialId?: string | null
    materialTitle?: string | null
    passage?: string | null
    pageNumber?: number | null
  } | null>(null)

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Load quiz and questions
  useEffect(() => {
    if (!quizId || !user) return

    const loadQuiz = async () => {
      setIsLoading(true)
      try {
        const { data: qData, error: qErr } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .eq('user_id', user.id)
          .single()

        if (qErr || !qData) throw new Error('Quiz not found')
        setQuiz(qData)

        const { data: questionsData, error: questErr } = await supabase
          .from('quiz_questions')
          .select('*')
          .eq('quiz_id', quizId)
          .order('position', { ascending: true })

        if (questErr) throw questErr
        setQuestions(sanitizeQuestions(questionsData || []))
      } catch (err: any) {
        toast.error(err.message || 'Failed to load quiz')
        navigate('/quizzes')
      } finally {
        setIsLoading(false)
      }
    }

    loadQuiz()
  }, [quizId, user])

  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length

  const handleSelectOption = (option: string) => {
    if (!currentQuestion) return
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: option,
    }))
  }

  const answeredCount = Object.keys(answers).length

  const handleSubmitQuiz = async () => {
    if (!quizId || !user) return
    setIsSubmitting(true)

    const formattedAnswers = questions.map(q => ({
      question_id: q.id,
      selected_answer: answers[q.id] || '',
    }))

    if (!navigator.onLine) {
      await queueOutboxAction('submit_cached_quiz', {
        quizId,
        answers: formattedAnswers,
        durationSeconds: secondsElapsed,
      })
      toast.info('Quiz completed offline! Score and analytics will synchronize once reconnected.')
      navigate('/quizzes')
      return
    }

    try {
      let resultData: any = null

      try {
        const { data, error } = await supabase.rpc('submit_quiz_attempt', {
          p_quiz_id: quizId,
          p_answers: formattedAnswers,
          p_duration_seconds: secondsElapsed,
        })

        if (!error && data?.attempt_id) {
          resultData = data
        } else if (error) {
          console.warn('RPC submit_quiz_attempt error, evaluating locally:', error.message)
        }
      } catch (rpcErr: any) {
        console.warn('RPC submit_quiz_attempt exception, evaluating locally:', rpcErr?.message)
      }

      // Client-side evaluation fallback
      if (!resultData) {
        let correctCount = 0
        const evaluatedAnswers: any[] = []

        for (const q of questions) {
          const selected = answers[q.id] || ''
          const isCorrect = (selected.trim().toLowerCase() === q.correct_answer.trim().toLowerCase())
          if (isCorrect) correctCount++
          evaluatedAnswers.push({
            question_id: q.id,
            selected_answer: selected,
            is_correct: isCorrect,
            topic: q.topic || 'General',
          })
        }

        const scorePercent = Math.round((correctCount / questions.length) * 100)
        const attemptId = crypto.randomUUID()
        const nowIso = new Date().toISOString()

        try {
          // Insert attempt
          await supabase.from('quiz_attempts').insert({
            id: attemptId,
            user_id: user?.id,
            quiz_id: quizId,
            score_percent: scorePercent,
            correct_count: correctCount,
            total_count: questions.length,
            duration_seconds: secondsElapsed,
            score: correctCount,
            total_questions: questions.length,
            percentage: scorePercent,
            time_spent_seconds: secondsElapsed,
            status: 'completed',
            started_at: nowIso,
            completed_at: nowIso,
          })

          // Insert answers
          const ansPayload = evaluatedAnswers.map(a => ({
            attempt_id: attemptId,
            question_id: a.question_id,
            user_id: user?.id,
            selected_answer: a.selected_answer,
            is_correct: a.is_correct,
            topic: a.topic,
          }))

          await supabase.from('attempt_answers').insert(ansPayload)
        } catch (dbErr) {
          console.warn('Database insert failed, proceeding with local result:', dbErr)
        }

        resultData = {
          attempt_id: attemptId,
          score_percent: scorePercent,
          correct_count: correctCount,
          total_count: questions.length,
          points_awarded: scorePercent >= 100 ? 40 : scorePercent >= 80 ? 30 : 20,
        }
      }

      toast.success(`Quiz completed! You scored ${resultData.score_percent}% (+${resultData.points_awarded} pts)`)
      navigate(`/quizzes/${quizId}/results/${resultData.attempt_id}`)
    } catch (err: any) {
      console.error('Quiz submission error:', err)
      toast.error(err.message || 'Failed to submit quiz attempt')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getQuestionCitation = (q?: QuizQuestion) => {
    if (!q) return null

    if (q.source_passage || q.source_page) {
      return {
        materialId: q.material_id || quiz?.material_id || null,
        materialTitle: q.material_title || quiz?.title || 'Study Material',
        passage: q.source_passage,
        pageNumber: q.source_page || 1,
      }
    }

    if (q.explanation) {
      const citationMatch = q.explanation.match(/\[Citation:\s*([^|]+)\s*\|\s*Page\s*(\d+)\s*\|\s*Passage:\s*"([^"]+)"\]/i)
      if (citationMatch) {
        return {
          materialId: quiz?.material_id || null,
          materialTitle: citationMatch[1].trim(),
          passage: citationMatch[3].trim(),
          pageNumber: parseInt(citationMatch[2], 10),
        }
      }
    }

    if (quiz?.material_id) {
      return {
        materialId: quiz.material_id,
        materialTitle: quiz.title,
        passage: q.explanation || q.correct_answer,
        pageNumber: 1,
      }
    }

    return null
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-neutral-muted">No questions found for this quiz.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/quizzes')}>
          Back to Quizzes
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Bar: Progress, Question Counter, Timer */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/quizzes')}
          className="inline-flex items-center text-xs font-semibold text-neutral-muted hover:text-ink dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Quit Quiz
        </button>

        <div className="flex items-center gap-3">
          {/* Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-surface border border-neutral-border dark:border-neutral-800 text-xs font-bold text-ink dark:text-neutral-200">
            <Clock className="h-3.5 w-3.5 text-blue" />
            <span>{formatTimer(secondsElapsed)}</span>
          </div>

          <Badge
            variant={
              quiz.difficulty === 'easy'
                ? 'easy'
                : quiz.difficulty === 'hard'
                ? 'hard'
                : 'medium'
            }
          >
            {quiz.difficulty}
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-neutral-muted font-medium">
          <span>
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span>{answeredCount} answered</span>
        </div>
        <Progress value={currentIndex + 1} max={totalQuestions} indicatorClassName="bg-blue" />
      </div>

      {/* Main Question Card */}
      {!isReviewOpen ? (
        <Card className="p-6 sm:p-8 space-y-6 shadow-soft border-t-2 border-t-blue">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {currentQuestion.topic && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue">
                  Topic: {currentQuestion.topic}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-ink dark:text-white leading-snug">
              {currentQuestion.question_text}
            </h2>
          </div>

          {/* Source Material Citation Pill */}
          {(() => {
            const citation = getQuestionCitation(currentQuestion)
            if (!citation) return null
            return (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-xs">
                <div className="flex items-center gap-1.5 text-blue font-semibold truncate">
                  <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Source: {citation.materialTitle} {citation.pageNumber ? `• Page ${citation.pageNumber}` : ''}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCitation(citation)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2 decoration-blue/40 hover:decoration-blue flex-shrink-0 cursor-pointer"
                >
                  <span>View Source Passage</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )
          })()}

          {/* Option Cards */}
          <div className="space-y-3 pt-2">
            {currentQuestion.options.map((opt, i) => {
              const isSelected = answers[currentQuestion.id] === opt
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-blue bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-semibold shadow-soft'
                      : 'border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface hover:border-blue-300 text-ink dark:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-7 w-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                        isSelected
                          ? 'bg-blue text-white'
                          : 'bg-neutral-bg dark:bg-neutral-800 text-neutral-muted'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm leading-relaxed">{opt}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="h-5 w-5 text-blue flex-shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-border dark:border-neutral-800">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(prev => prev - 1)}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReviewOpen(true)}
              >
                Review ({answeredCount}/{totalQuestions})
              </Button>

              {currentIndex < totalQuestions - 1 ? (
                <Button
                  variant="blue"
                  size="sm"
                  onClick={() => setCurrentIndex(prev => prev + 1)}
                >
                  Next <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              ) : (
                <Button
                  variant="blue"
                  size="sm"
                  onClick={() => setIsReviewOpen(true)}
                >
                  Review & Submit
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        /* ANSWER REVIEW SCREEN BEFORE FINAL SUBMISSION */
        <Card className="p-6 sm:p-8 space-y-6 border-t-2 border-t-blue shadow-soft">
          <div>
            <CardTitle>Review Your Answers</CardTitle>
            <CardDescription>
              Check your progress before final evaluation. You answered {answeredCount} of {totalQuestions} questions.
            </CardDescription>
          </div>

          <div className="space-y-3 divide-y divide-neutral-border dark:divide-neutral-800">
            {questions.map((q, idx) => {
              const answered = Boolean(answers[q.id])
              return (
                <div
                  key={q.id}
                  className="pt-3 first:pt-0 flex items-center justify-between gap-3 text-sm cursor-pointer hover:opacity-80"
                  onClick={() => {
                    setCurrentIndex(idx)
                    setIsReviewOpen(false)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-lg bg-neutral-bg dark:bg-neutral-800 flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-medium truncate max-w-sm sm:max-w-md">
                      {q.question_text}
                    </span>
                  </div>
                  <div>
                    {answered ? (
                      <span className="text-xs font-bold text-mint flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Answered
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-coral flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> Unanswered
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-border dark:border-neutral-800">
            <Button variant="outline" size="sm" onClick={() => setIsReviewOpen(false)}>
              Back to Quiz
            </Button>
            <Button
              variant="blue"
              size="lg"
              isLoading={isSubmitting}
              onClick={handleSubmitQuiz}
            >
              Submit Quiz for Evaluation
            </Button>
          </div>
        </Card>
      )}

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
