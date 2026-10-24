import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Brain,
  Layers,
  Plus,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { TopicPerformance, StudyPlan } from '@/types/database'

export const WeakTopicsPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [topics, setTopics] = useState<TopicPerformance[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false)
  const [addingTaskForTopic, setAddingTaskForTopic] = useState<string | null>(null)

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      const { data: topicData, error: tErr } = await supabase
        .from('topic_performance')
        .select('*')
        .eq('user_id', user.id)
        .order('score_percent', { ascending: true })

      if (tErr) throw tErr
      setTopics(topicData || [])

      const { data: plansData } = await supabase
        .from('study_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setPlans(plansData || [])
    } catch (err) {
      console.error('Error loading topic performance:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  // Split into Weak (<60% & total >=5), In Progress (60-79%), Strong (>=80%), and Insufficient Data (<5 questions)
  const weakTopics = topics.filter(t => t.total >= 5 && Number(t.score_percent) < 60)
  const improvingTopics = topics.filter(t => t.total >= 5 && Number(t.score_percent) >= 60 && Number(t.score_percent) < 80)
  const strongTopics = topics.filter(t => t.total >= 5 && Number(t.score_percent) >= 80)
  const insufficientDataTopics = topics.filter(t => t.total < 5)

  // One-click add revision task to active plan
  const handleAddRevisionTask = async (topic: TopicPerformance) => {
    if (!user) return
    if (plans.length === 0) {
      toast.error('Please generate or create a study plan first before adding revision tasks.')
      navigate('/planner')
      return
    }

    const targetPlan = plans[0]
    setAddingTaskForTopic(topic.id)

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('study_tasks').insert({
        plan_id: targetPlan.id,
        user_id: user.id,
        subject: topic.subject,
        topic: `Revision: ${topic.topic}`,
        task_type: 'revision',
        scheduled_date: todayStr,
        duration_minutes: 45,
        priority: 'high',
        notes: `Focus area based on quiz score of ${topic.score_percent}%.`,
        completed: false,
      })

      if (error) throw error
      toast.success(`Added revision task for "${topic.topic}" to your plan!`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add revision task')
    } finally {
      setAddingTaskForTopic(null)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Weak Topics & Adaptive Recommendations
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Topic mastery evaluated from your real quiz results.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="coral"
            size="sm"
            onClick={() => navigate('/planner?replan=true')}
          >
            <Sparkles className="h-4 w-4 mr-1.5" /> Smart Re-Plan Overdue
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRulesModalOpen(true)}
          >
            <HelpCircle className="h-4 w-4 mr-1.5 text-coral" /> How It Works
          </Button>
        </div>
      </div>

      {/* Transparent Rules Banner */}
      <div className="p-4 rounded-2xl bg-coral-500/10 dark:bg-coral-500/20 border border-coral-300 dark:border-coral-700/50 text-xs text-ink dark:text-neutral-200 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-coral flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Transparent Rule-Based Guidance: </span>
          A topic is designated as "Weak / Needs Practice" only after at least 5 questions have been answered and accuracy is under 60%. This recommendation engine uses deterministic pedagogical criteria (no ungrounded black-box algorithms).
        </div>
      </div>

      {/* Section 1: Topics Needing Practice (< 60% and total >= 5) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink dark:text-white flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-coral" />
            Needs Practice ({weakTopics.length})
          </h2>
          <span className="text-xs text-neutral-muted">Score &lt; 60% with 5+ attempts</span>
        </div>

        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-2xl" />
        ) : weakTopics.length === 0 ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-mint mx-auto mb-2" />
            <h4 className="text-sm font-bold text-ink dark:text-white">No weak topics detected</h4>
            <p className="text-xs text-neutral-muted mt-0.5 max-w-sm mx-auto">
              Either your accuracy is 60%+ on all tested subjects, or topics haven't reached the 5-question threshold yet.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weakTopics.map(topic => {
              const currentScore = Number(topic.score_percent)
              const prevScore = Number(topic.previous_score_percent)
              const scoreDiff = currentScore - prevScore

              return (
                <Card key={topic.id} className="p-5 space-y-4 border-l-4 border-l-coral shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-muted">
                        {topic.subject}
                      </span>
                      <h3 className="text-base font-bold text-ink dark:text-white mt-0.5">
                        {topic.topic}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-extrabold text-coral">{currentScore}%</span>
                      <div className="text-[10px] text-neutral-muted">
                        {topic.correct} of {topic.total} correct
                      </div>
                    </div>
                  </div>

                  <Progress value={currentScore} indicatorClassName="bg-coral" />

                  {/* Trend vs previous */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-border dark:border-neutral-border">
                    <div className="flex items-center gap-1 text-neutral-muted">
                      <span>Trend:</span>
                      {scoreDiff > 0 ? (
                        <span className="text-mint font-bold flex items-center">
                          <TrendingUp className="h-3.5 w-3.5 mr-0.5" /> +{scoreDiff}%
                        </span>
                      ) : scoreDiff < 0 ? (
                        <span className="text-coral font-bold flex items-center">
                          <TrendingDown className="h-3.5 w-3.5 mr-0.5" /> {scoreDiff}%
                        </span>
                      ) : (
                        <span className="text-neutral-muted flex items-center">
                          <Minus className="h-3.5 w-3.5 mr-0.5" /> Steady
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="coral"
                        size="sm"
                        isLoading={addingTaskForTopic === topic.id}
                        onClick={() => handleAddRevisionTask(topic)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Revision Task
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Section 2: Improving Topics (60% - 79%) */}
      {improvingTopics.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink dark:text-white flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sun" />
              Improving ({improvingTopics.length})
            </h2>
            <span className="text-xs text-neutral-muted">Score 60% - 79%</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {improvingTopics.map(topic => (
              <Card key={topic.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-ink dark:text-white">{topic.topic}</span>
                    <span className="text-neutral-muted ml-2">({topic.subject})</span>
                  </div>
                  <span className="font-bold text-sun-700 dark:text-sun">{topic.score_percent}%</span>
                </div>
                <Progress value={Number(topic.score_percent)} indicatorClassName="bg-sun" />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Mastered Topics (>= 80%) */}
      {strongTopics.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink dark:text-white flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-mint" />
              Mastered Topics ({strongTopics.length})
            </h2>
            <span className="text-xs text-neutral-muted">Score 80%+</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {strongTopics.map(topic => (
              <Card key={topic.id} className="p-3 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="truncate">{topic.topic}</span>
                  <span className="text-mint">{topic.score_percent}%</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Insufficient Data (< 5 questions) */}
      {insufficientDataTopics.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-muted flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-neutral-muted" />
              Insufficient Data ({insufficientDataTopics.length})
            </h2>
            <span className="text-xs text-neutral-muted">&lt; 5 answered questions</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {insufficientDataTopics.map(topic => (
              <Card key={topic.id} className="p-3 bg-neutral-bg/60 dark:bg-surface-elevated/60 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold truncate">{topic.topic}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {topic.total}/5 answered
                  </Badge>
                </div>
                <p className="text-[10px] text-neutral-muted mt-1">
                  Answer {5 - topic.total} more question{5 - topic.total === 1 ? '' : 's'} to compute confidence
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* How Recommendations Work Modal */}
      <Dialog
        open={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        title="How Adaptive Learning Works"
        description="Our pedagogical model uses deterministic, transparent rules rather than black-box algorithms."
      >
        <div className="space-y-4 text-xs leading-relaxed text-ink dark:text-neutral-200">
          <div className="p-3 rounded-xl bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border space-y-2">
            <h4 className="font-bold text-sm">Classification Tiers:</h4>
            <ul className="space-y-1.5 pl-2">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-coral flex-shrink-0" />
                <span><strong>Needs Practice:</strong> Score below 60% with at least 5 questions answered.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sun flex-shrink-0" />
                <span><strong>Improving:</strong> Score between 60% and 79% with at least 5 questions answered.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-mint flex-shrink-0" />
                <span><strong>Strong / Mastered:</strong> Score 80% or above with at least 5 questions answered.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neutral-muted flex-shrink-0" />
                <span><strong>Insufficient Data:</strong> Fewer than 5 questions answered on this topic.</span>
              </li>
            </ul>
          </div>

          <p>
            When generating study plans, StudySpark loads any topics currently in the "Needs Practice" tier and instructs the AI planner to allocate dedicated revision and practice blocks for those subjects before your exam dates.
          </p>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsRulesModalOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
