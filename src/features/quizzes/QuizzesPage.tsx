import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Brain,
  History,
  Sparkles,
  Play,
  RotateCcw,
  Trash2,
  AlertCircle,
  FileText,
  Clock,
  Award,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Quiz, Material, QuizAttempt } from '@/types/database'
import { generateQuizLocally } from '@/lib/aiFallback'

export const QuizzesPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselectedMaterialId = searchParams.get('materialId')

  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')

  // Generator form state
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(preselectedMaterialId || '')
  const [rawText, setRawText] = useState('')
  const [quizTitle, setQuizTitle] = useState('')
  const [numQuestions, setNumQuestions] = useState<number>(5)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'true_false'>('multiple_choice')
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // History state
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load materials for selection
  useEffect(() => {
    if (!user) return
    supabase
      .from('materials')
      .select('id, title, subject, status')
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .then(({ data }) => {
        if (data) setMaterials(data as Material[])
      })
  }, [user])

  // Load quiz history
  const loadHistory = async () => {
    if (!user) return
    setIsLoadingHistory(true)
    try {
      const { data: quizData, error: qErr } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (qErr) throw qErr
      setQuizzes(quizData || [])

      const { data: attData } = await supabase
        .from('quiz_attempts')
        .select('*, quiz:quizzes(*)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      setAttempts(attData || [])
    } catch (err) {
      console.error('Error loading history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
  }, [activeTab, user])

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenError(null)

    if (!selectedMaterialId && (!rawText || rawText.trim().length < 50)) {
      setGenError('Please select a material or paste at least 50 characters of study text.')
      return
    }

    if (!navigator.onLine) {
      setGenError('AI Quiz generation requires an active internet connection.')
      return
    }

    setIsGenerating(true)

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not authenticated')

      let finalQuizId: string | null = null

      // 1. Try Supabase Edge Function first
      try {
        const { data, error } = await supabase.functions.invoke('generate-quiz', {
          body: {
            material_id: selectedMaterialId || undefined,
            raw_text: !selectedMaterialId ? rawText.trim() : undefined,
            title: quizTitle.trim() || undefined,
            num_questions: Number(numQuestions),
            difficulty,
            question_type: questionType,
          },
        })

        if (!error && data?.quiz_id) {
          finalQuizId = data.quiz_id
        } else if (error) {
          console.warn('Edge function returned error, attempting browser AI generator:', error.message)
        }
      } catch (edgeErr: any) {
        console.warn('Edge function unavailable, falling back to browser generator:', edgeErr?.message)
      }

      // 2. Fallback to smart in-browser generator if Edge Function is not deployed
      if (!finalQuizId) {
        const localResult = await generateQuizLocally({
          userId: session.user.id,
          materialId: selectedMaterialId || undefined,
          rawText: !selectedMaterialId ? rawText.trim() : undefined,
          title: quizTitle.trim() || undefined,
          numQuestions: Number(numQuestions),
          difficulty,
          questionType,
        })
        finalQuizId = localResult.quiz_id
      }

      toast.success('Quiz generated successfully! Starting quiz now...')
      navigate(`/quizzes/${finalQuizId}/take`)
    } catch (err: any) {
      console.error('Quiz generation error:', err)
      setGenError(err.message || 'Failed to generate quiz. Please check configuration.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteQuiz = async () => {
    if (!quizToDelete) return
    setIsDeleting(true)

    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', quizToDelete.id)
      if (error) throw error
      toast.success('Quiz deleted')
      setQuizToDelete(null)
      loadHistory()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete quiz')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Active Recall Quizzes
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Generate grounded practice quizzes and track topic mastery over time.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex p-1 bg-white dark:bg-surface border border-neutral-border dark:border-neutral-800 rounded-2xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'generate'
                ? 'bg-blue text-white shadow-soft'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            <Brain className="h-4 w-4" /> Generator
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-blue text-white shadow-soft'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            <History className="h-4 w-4" /> History
          </button>
        </div>
      </div>

      {activeTab === 'generate' ? (
        <Card className="border-t-2 border-t-blue shadow-soft">
          <CardHeader>
            <CardTitle>Create AI Practice Quiz</CardTitle>
            <CardDescription>
              Questions are created by Claude Sonnet and grounded strictly in your study text.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerateQuiz} className="space-y-5">
              {genError && (
                <div className="p-4 text-xs text-destructive bg-coral-50 dark:bg-coral-950/20 rounded-2xl border border-coral-200 dark:border-coral-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-coral" />
                  <div>
                    <p className="font-bold text-coral-800 dark:text-coral-300">Quiz Generation Failed</p>
                    <p className="mt-0.5 text-coral-700 dark:text-coral-400">{genError}</p>
                  </div>
                </div>
              )}

              {/* Source selection */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-ink dark:text-neutral-200 block mb-2">
                  1. Study Source
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-neutral-muted block mb-1">
                      Choose from your uploaded materials:
                    </label>
                    <select
                      value={selectedMaterialId}
                      onChange={e => {
                        setSelectedMaterialId(e.target.value)
                        if (e.target.value) setRawText('')
                      }}
                      className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-2.5 text-sm text-ink dark:text-white focus:outline-none focus:border-blue"
                    >
                      <option value="">— Select an uploaded material —</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.source_type === 'youtube'
                            ? `📺 [YouTube] ${m.title}`
                            : m.source_type === 'audio'
                            ? `🎙️ [Audio] ${m.title}`
                            : m.source_type === 'video'
                            ? `🎥 [Video] ${m.title}`
                            : `📄 ${m.title}`}{' '}
                          ({m.subject || 'General'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-neutral-border dark:border-neutral-800 w-full" />
                    <span className="bg-white dark:bg-surface px-3 text-[10px] text-neutral-muted uppercase tracking-wider absolute">
                      OR PASTE RAW NOTES
                    </span>
                  </div>

                  <div>
                    <textarea
                      rows={4}
                      placeholder="Paste textbook excerpt, lecture slides, or revision notes directly..."
                      value={rawText}
                      onChange={e => {
                        setRawText(e.target.value)
                        if (e.target.value) setSelectedMaterialId('')
                      }}
                      className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-3 text-sm text-ink dark:text-white focus:outline-none focus:border-blue"
                    />
                  </div>
                </div>
              </div>

              {/* Quiz Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-ink dark:text-neutral-200 block mb-1.5">
                    Number of Questions
                  </label>
                  <select
                    value={numQuestions}
                    onChange={e => setNumQuestions(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-2.5 text-sm text-ink dark:text-white focus:outline-none focus:border-blue"
                  >
                    {[3, 5, 10, 15, 20, 25].map(n => (
                      <option key={n} value={n}>
                        {n} Questions
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-ink dark:text-neutral-200 block mb-1.5">
                    Difficulty Level
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'easy', label: 'Easy' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'hard', label: 'Hard' },
                    ].map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setDifficulty(d.id as any)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          difficulty === d.id
                            ? 'bg-blue text-white border-blue shadow-sm'
                            : 'border-neutral-border dark:border-neutral-800 text-neutral-muted hover:border-blue-300'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-ink dark:text-neutral-200 block mb-1.5">
                    Question Format
                  </label>
                  <select
                    value={questionType}
                    onChange={e => setQuestionType(e.target.value as any)}
                    className="w-full rounded-xl border border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface p-2.5 text-sm text-ink dark:text-white focus:outline-none focus:border-blue"
                  >
                    <option value="multiple_choice">Multiple Choice (4 options)</option>
                    <option value="true_false">True / False</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <Button
                  type="submit"
                  variant="blue"
                  size="lg"
                  className="w-full sm:w-auto px-8"
                  disabled={isGenerating}
                  isLoading={isGenerating}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Analyzing Notes & Generating Questions...' : 'Generate Practice Quiz'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* HISTORY TAB */
        <Card className="border-t-2 border-t-blue shadow-soft">
          <CardHeader>
            <CardTitle>Quiz Library & Past Attempts</CardTitle>
            <CardDescription>
              Review your scores, retake past quizzes, or inspect question rationales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : quizzes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Brain className="h-10 w-10 text-neutral-muted/50 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-ink dark:text-white">No quizzes generated yet</h4>
                <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
                  Generate your first quiz from your uploaded study materials.
                </p>
                <Button
                  variant="blue"
                  size="sm"
                  className="mt-4"
                  onClick={() => setActiveTab('generate')}
                >
                  Create a Quiz
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-border dark:divide-neutral-800">
                {quizzes.map(quiz => {
                  const quizAttempts = attempts.filter(a => a.quiz_id === quiz.id)
                  const latestAttempt = quizAttempts[0]

                  return (
                    <div
                      key={quiz.id}
                      className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-ink dark:text-white">{quiz.title}</h4>
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
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-neutral-muted">
                          <span>{quiz.num_questions} questions</span>
                          <span>•</span>
                          <span>{quiz.question_type === 'true_false' ? 'True/False' : 'Multiple Choice'}</span>
                          <span>•</span>
                          <span>Created {formatDate(quiz.created_at)}</span>
                        </div>

                        {latestAttempt && (
                          <div className="mt-2 inline-flex items-center gap-2 text-xs">
                            <span className="text-neutral-muted">Last Score:</span>
                            <span
                              className={`font-bold ${
                                latestAttempt.score_percent >= 80
                                  ? 'text-mint'
                                  : latestAttempt.score_percent >= 60
                                  ? 'text-sun'
                                  : 'text-coral'
                              }`}
                            >
                              {latestAttempt.score_percent}% ({latestAttempt.correct_count}/
                              {latestAttempt.total_count})
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {latestAttempt && (
                          <Button
                            variant="mint-subtle"
                            size="sm"
                            className="font-bold shadow-xs"
                            onClick={() => navigate(`/quizzes/${quiz.id}/results/${latestAttempt.id}`)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> View Results
                          </Button>
                        )}
                        <Button
                          variant="blue"
                          size="sm"
                          className="font-bold shadow-sm"
                          onClick={() => navigate(`/quizzes/${quiz.id}/take`)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          {quizAttempts.length > 0 ? 'Retake Quiz' : 'Start Quiz'}
                        </Button>
                        <Button
                          variant="coral-subtle"
                          size="sm"
                          className="h-8 px-2.5 font-bold"
                          onClick={() => setQuizToDelete(quiz)}
                          title="Delete quiz"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Quiz Modal */}
      <Dialog
        open={Boolean(quizToDelete)}
        onClose={() => setQuizToDelete(null)}
        title="Delete Quiz"
        description={`Are you sure you want to delete "${quizToDelete?.title}"? All associated questions and past attempts will be removed.`}
        confirmText="Delete Quiz"
        confirmVariant="destructive"
        onConfirm={handleDeleteQuiz}
        isConfirmLoading={isDeleting}
      />
    </div>
  )
}
