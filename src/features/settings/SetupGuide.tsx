import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Terminal, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

export const SetupGuide: React.FC<{ missingItems?: string[] }> = ({ missingItems = [] }) => {
  const [activeTab, setActiveTab] = useState<'checklist' | 'env' | 'sql' | 'functions'>('checklist')

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard!`)
  }

  const envTemplate = `# StudySpark Supabase Credentials
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

  const edgeDeployCmd = `# 1. Link your Supabase CLI to your project
npx supabase link --project-ref your-project-ref

# 2. Set Claude API Key Secret
npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-api03-..."
npx supabase secrets set CLAUDE_MODEL="claude-sonnet-5-5"

# 3. Deploy all 5 production edge functions
npx supabase functions deploy generate-quiz
npx supabase functions deploy generate-flashcards
npx supabase functions deploy generate-study-plan
npx supabase functions deploy ai-assistant
npx supabase functions deploy award-points`

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-4xl w-full space-y-6">
        {/* Banner */}
        <div className="rounded-3xl bg-gradient-hero p-6 sm:p-8 text-white shadow-card">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <ShieldAlert className="h-7 w-7 text-white" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                StudySpark Configuration Required
              </h1>
              <p className="text-white/80 text-sm mt-1">
                StudySpark runs with real Supabase database connections and real Claude API calls. Complete the checklist below to activate all features.
              </p>
            </div>
          </div>

          {missingItems.length > 0 && (
            <div className="mt-5 p-4 bg-black/20 backdrop-blur-md rounded-2xl border border-white/20">
              <p className="text-xs font-bold uppercase tracking-wider text-sun">
                Currently Missing Configuration:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {missingItems.map(item => (
                  <Badge key={item} variant="coral" className="font-mono text-xs">
                    <AlertCircle className="w-3.5 h-3.5 mr-1" />
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-border dark:border-ink-800 gap-2 pb-1 overflow-x-auto">
          {[
            { id: 'checklist', label: '1. Setup Checklist' },
            { id: 'env', label: '2. Environment Variables (.env)' },
            { id: 'sql', label: '3. Database Migration SQL' },
            { id: 'functions', label: '4. Supabase Edge Functions' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue text-white shadow-card'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === 'checklist' && (
          <Card>
            <CardHeader>
              <CardTitle>5-Step Production Checklist</CardTitle>
              <CardDescription>
                Follow these exact steps to complete deployment. All database tables and edge functions are pre-written in the codebase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  {
                    step: 'Step 1',
                    title: 'Connect Supabase & Run Schema Migration',
                    desc: 'Create a Supabase project at supabase.com. Go to SQL Editor and run the migration SQL file located at supabase/migrations/20261024000000_studyspark_schema.sql.',
                  },
                  {
                    step: 'Step 2',
                    title: 'Set Supabase Secrets (Claude API)',
                    desc: 'In Supabase Dashboard (or CLI), set secret ANTHROPIC_API_KEY with your real Anthropic key, and optionally CLAUDE_MODEL (defaults to claude-sonnet-5-5).',
                  },
                  {
                    step: 'Step 3',
                    title: 'Deploy Edge Functions',
                    desc: 'Deploy the 5 edge functions: generate-quiz, generate-flashcards, generate-study-plan, ai-assistant, and award-points.',
                  },
                  {
                    step: 'Step 4',
                    title: 'Private Storage Bucket & Policies',
                    desc: 'Create private bucket "study-materials" in Supabase Storage with user-isolated RLS folder policies (already created in the migration script).',
                  },
                  {
                    step: 'Step 5',
                    title: 'Configure Frontend .env',
                    desc: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your local .env file and restart Vite.',
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-neutral-bg/60 dark:bg-ink-950/60 border border-neutral-border dark:border-ink-800">
                    <span className="flex-shrink-0 h-7 w-7 rounded-full bg-blue/15 text-blue font-bold text-xs flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-ink dark:text-white">{item.title}</h4>
                      <p className="text-xs text-neutral-muted dark:text-neutral-300 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'env' && (
          <Card>
            <CardHeader>
              <CardTitle>Environment Variables Setup</CardTitle>
              <CardDescription>
                Create a file named <code>.env</code> in the project root directory and add the following keys from your Supabase Project Settings → API:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="p-4 bg-ink-950 text-white rounded-2xl text-xs font-mono overflow-x-auto">
                  {envTemplate}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2 text-xs"
                  onClick={() => copyToClipboard(envTemplate, '.env template')}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy .env
                </Button>
              </div>
              <p className="text-xs text-neutral-muted">
                Note: Client code only accesses public keys (VITE_*). Anthropic API keys are strictly kept safe inside Supabase Edge Functions.
              </p>
            </CardContent>
          </Card>
        )}

        {activeTab === 'sql' && (
          <Card>
            <CardHeader>
              <CardTitle>Database Schema & Security SQL</CardTitle>
              <CardDescription>
                The complete schema file with 18 tables, triggers, and Row Level Security is saved at:
                <code className="block mt-1 font-mono text-blue">
                  supabase/migrations/20261024000000_studyspark_schema.sql
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-neutral-muted mb-3">
                You can copy and run this file directly in the Supabase Dashboard SQL Editor or via <code>npx supabase db push</code>.
              </p>
              <div className="p-4 bg-blue/10 dark:bg-surface-elevated rounded-2xl border border-blue/20 dark:border-ink-800">
                <p className="text-xs font-medium text-ink dark:text-white">
                  Included tables: profiles, materials, quizzes, quiz_questions, quiz_attempts, attempt_answers, flashcard_sets, flashcards, flashcard_reviews, study_plans, study_tasks, study_sessions, topic_performance, reminders, reminder_preferences, exams, points_ledger, achievements, ai_conversations, ai_messages.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'functions' && (
          <Card>
            <CardHeader>
              <CardTitle>Supabase Edge Functions Deployment</CardTitle>
              <CardDescription>
                Run the following commands using the Supabase CLI in your terminal:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="p-4 bg-ink-950 text-white rounded-2xl text-xs font-mono overflow-x-auto">
                  {edgeDeployCmd}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2 text-xs"
                  onClick={() => copyToClipboard(edgeDeployCmd, 'CLI deployment commands')}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Commands
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
