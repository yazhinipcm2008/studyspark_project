import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Award,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Sparkles,
  ArrowRight,
  BookOpen,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTime } from '@/lib/utils'
import type { QuizAttempt, AttemptAnswer, QuizQuestion } from '@/types/database'
import { MaterialPassageViewerModal } from '@/components/materials/MaterialPassageViewerModal'

export const QuizResultsPage: React.FC = () => {
  const { id: quizId, attemptId } = useParams<{ id: string; attemptId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [answers, setAnswers] = useState<AttemptAnswer[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Passage viewer modal state
  const [viewingCitation, setViewingCitation] = useState<{
    materialId?: string | null
    materialTitle?: string | null
    passage?: string | null
    pageNumber?: number | null
  } | null>(null)

  useEffect(() => {
    if (!quizId || !attemptId || !user) return

    const loadResults = async () => {
      setIsLoading(true)
      try {
        const { data: attData, error: attErr } = await supabase
          .from('quiz_attempts')
          .select('*, quiz:quizzes(*)')
          .eq('id', attemptId)
          .eq('user_id', user.id)
          .single()

        if (attErr || !attData) throw new Error('Attempt not found')
        setAttempt(attData)

        // Answers
        const { data: ansData } = await supabase
          .from('attempt_answers')
          .select('*')
          .eq('attempt_id', attemptId)

        setAnswers(ansData || [])

        // Questions for options and explanations
        const { data: questData } = await supabase
          .from('quiz_questions')
          .select('*')
          .eq('quiz_id', quizId)
          .order('position', { ascending: true })

        setQuestions(questData || [])

        // If score is 80%+ trigger celebration confetti!
        if (Number(attData.score_percent) >= 80) {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          })
        }
      } catch (err: any) {
        console.error('Error loading quiz results:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadResults()
  }, [quizId, attemptId, user])

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (!attempt) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-neutral-muted">Attempt results not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/quizzes')}>
          Back to Quizzes
        </Button>
      </div>
    )
  }

  // Topic breakdown
  const topicMap: Record<string, { total: number; correct: number }> = {}
  answers.forEach(a => {
    const t = a.topic || 'General'
    if (!topicMap[t]) topicMap[t] = { total: 0, correct: 0 }
    topicMap[t].total += 1
    if (a.is_correct) topicMap[t].correct += 1
  })

  const scoreNum = Number(attempt.score_percent)
  const isPassing = scoreNum >= 60
  const getQuestionCitation = (q: QuizQuestion) => {
    if (q.source_passage || q.source_page) {
      return {
        materialId: q.material_id || (attempt as any)?.quiz?.material_id || null,
        materialTitle: q.material_title || (attempt as any)?.quiz?.title || 'Study Material',
        passage: q.source_passage,
        pageNumber: q.source_page || 1,
      }
    }

    if (q.explanation) {
      const citationMatch = q.explanation.match(/\[Citation:\s*([^|]+)\s*\|\s*Page\s*(\d+)\s*\|\s*Passage:\s*"([^"]+)"\]/i)
      if (citationMatch) {
        return {
          materialId: (attempt as any)?.quiz?.material_id || null,
          materialTitle: citationMatch[1].trim(),
          passage: citationMatch[3].trim(),
          pageNumber: parseInt(citationMatch[2], 10),
        }
      }
    }

    if ((attempt as any)?.quiz?.material_id) {
      return {
        materialId: (attempt as any)?.quiz?.material_id,
        materialTitle: (attempt as any)?.quiz?.title || 'Study Material',
        passage: q.explanation || q.correct_answer,
        pageNumber: 1,
      }
    }

    return null
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Score Hero Card */}
      <div
        className={`rounded-3xl p-6 sm:p-8 shadow-soft ${
          scoreNum >= 80
            ? 'bg-gradient-hero text-white'
            : scoreNum >= 60
            ? 'bg-gradient-streak text-ink-navy'
            : 'bg-gradient-focus text-ink-navy'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
              <Award className="h-3.5 w-3.5" />
              {scoreNum >= 80 ? 'Mastery Achieved' : isPassing ? 'Solid Performance' : 'Needs Review'}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {scoreNum}% Score
            </h1>
            <p className={`text-sm ${scoreNum >= 80 ? 'text-white/90' : 'text-ink-navy/80'}`}>
              You answered {attempt.correct_count} of {attempt.total_count} questions correctly.
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-inherit border-current/30 backdrop-blur-md w-full sm:w-auto font-bold"
              onClick={() => navigate(`/quizzes/${quizId}/take`)}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Retake Quiz
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-ink-navy hover:bg-white/90 border-transparent shadow-sm w-full sm:w-auto font-bold"
              onClick={() => navigate('/weak-topics')}
            >
              Check Weak Topics <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Topic Breakdown Card */}
      <Card className="border-t-2 border-t-blue shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Sub-Topic Performance</CardTitle>
          <CardDescription>
            These results dynamically update your adaptive learning metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(topicMap).map(([topicName, stats]) => {
              const pct = Math.round((stats.correct / stats.total) * 100)
              return (
                <div key={topicName} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink dark:text-white">{topicName}</span>
                    <span className="font-semibold text-neutral-muted">
                      {stats.correct}/{stats.total} ({pct}%)
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    indicatorClassName={pct >= 80 ? 'bg-mint' : pct >= 60 ? 'bg-sun' : 'bg-coral'}
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Per-Question Explanations */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-muted">
          Question Review & Rationales
        </h3>

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const userAnswer = answers.find(a => a.question_id === q.id)
            const isCorrect = userAnswer?.is_correct
            const citation = getQuestionCitation(q)
            const cleanExplanation = q.explanation?.replace(/\[Citation:[^\]]+\]/g, '').trim()

            return (
              <Card key={q.id} className="p-5 sm:p-6 space-y-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                        isCorrect
                          ? 'bg-mint-100 text-mint-700 dark:bg-mint-950/60 dark:text-mint'
                          : 'bg-coral-100 text-coral-700 dark:bg-coral-950/60 dark:text-coral'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink dark:text-white leading-snug">
                        {q.question_text}
                      </p>
                      {q.topic && (
                        <span className="text-[10px] font-semibold text-neutral-muted uppercase tracking-wider mt-0.5 block">
                          Topic: {q.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isCorrect ? (
                      <Badge variant="easy">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Correct
                      </Badge>
                    ) : (
                      <Badge variant="hard">
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Incorrect
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Answers Comparison */}
                <div className="p-3 rounded-xl bg-neutral-bg dark:bg-surface text-xs space-y-1.5 border border-neutral-border dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-muted font-medium w-28">Your Answer:</span>
                    <span className={`font-bold ${isCorrect ? 'text-mint' : 'text-coral'}`}>
                      {userAnswer?.selected_answer || '(Unanswered)'}
                    </span>
                  </div>
                  {!isCorrect && (
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-muted font-medium w-28">Correct Answer:</span>
                      <span className="font-bold text-mint">{q.correct_answer}</span>
                    </div>
                  )}
                </div>

                {/* Explanation */}
                {cleanExplanation && (
                  <div className="text-xs text-neutral-muted leading-relaxed pl-2 border-l-2 border-blue">
                    <strong className="text-ink dark:text-neutral-200">Explanation: </strong>
                    {cleanExplanation}
                  </div>
                )}

                {/* Source Material Citation Pill */}
                {citation && (
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
