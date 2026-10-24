import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  Brain,
  Layers,
  Calendar,
  BarChart3,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'

export const LandingPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 text-ink dark:text-white flex flex-col selection:bg-blue selection:text-white">
      {/* Top Navbar */}
      <header className="h-20 border-b border-neutral-border dark:border-ink-800 bg-white/70 dark:bg-ink-900/70 backdrop-blur-md sticky top-0 z-40 px-6 sm:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="h-10 w-10 rounded-2xl bg-blue flex items-center justify-center text-white shadow-card">
            <Sparkles className="h-5 w-5 text-sun fill-sun" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-ink dark:text-white">
            StudySpark
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Button variant="blue" onClick={() => navigate('/dashboard')}>
              Go to Dashboard <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button variant="blue" onClick={() => navigate('/signup')}>
                Get Started Free
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 px-6 sm:px-12 max-w-7xl mx-auto text-center flex flex-col items-center">
        {/* Ambient Glow */}
        <div className="absolute top-1/4 -z-10 h-72 w-72 rounded-full bg-blue/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 -z-10 h-64 w-64 rounded-full bg-sky/15 blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue/10 dark:bg-surface-elevated border border-blue/20 text-blue text-xs font-bold uppercase tracking-wider mb-6">
          <Sparkles className="h-3.5 w-3.5 text-sun fill-sun" />
          The Intelligent Study Companion for College
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] max-w-4xl">
          Study Smarter with{' '}
          <span className="bg-gradient-hero bg-clip-text text-transparent">
            AI-Powered Recall
          </span>{' '}
          & Adaptive Plans
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-neutral-muted dark:text-neutral-300 max-w-2xl leading-relaxed">
          Upload your lecture notes, syllabi, or slides. Generate grounded active recall quizzes, interactive 3D flashcards, and personalized study schedules tuned to your exam dates and weak topics.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Button
            size="lg"
            variant="blue"
            onClick={() => navigate(user ? '/dashboard' : '/signup')}
            className="w-full sm:w-auto shadow-card px-8"
          >
            {user ? 'Enter Dashboard' : 'Start Studying Free'} <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              const el = document.getElementById('features')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="w-full sm:w-auto"
          >
            Explore Capabilities
          </Button>
        </div>

        {/* Feature Badges Grid */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 text-left w-full max-w-4xl">
          {[
            { title: 'Zero Fake Data', desc: 'Real Supabase DB & real Claude Sonnet AI' },
            { title: 'Offline-First PWA', desc: 'Study and review anywhere without internet' },
            { title: 'Strict Privacy', desc: 'Private isolated storage & Row Level Security' },
            { title: 'Adaptive Learning', desc: 'Targeted revision for your real weak topics' },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-ink-900/60 border border-neutral-border dark:border-ink-800 backdrop-blur-sm">
              <CheckCircle className="h-4 w-4 text-mint mb-2" />
              <h4 className="text-xs font-bold text-ink dark:text-white">{item.title}</h4>
              <p className="text-[11px] text-neutral-muted mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 sm:px-12 max-w-7xl mx-auto w-full border-t border-neutral-border dark:border-ink-800">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Engineered for High-Yield College Learning
          </h2>
          <p className="mt-3 text-neutral-muted dark:text-neutral-300 text-base">
            Every feature is grounded directly in cognitive science and your own course notes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="p-7 rounded-3xl bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-800 shadow-card hover:shadow-card transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-blue/15 flex items-center justify-center text-blue group-hover:scale-110 transition-transform mb-5">
              <Brain className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-ink dark:text-white">Active Recall Quizzes</h3>
            <p className="mt-2 text-sm text-neutral-muted dark:text-neutral-300 leading-relaxed">
              Generate multiple-choice or true/false questions grounded strictly in your uploaded PDFs and lecture notes. Timed testing and server-side verified scoring.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-7 rounded-3xl bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-800 shadow-card hover:shadow-card transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-coral/15 flex items-center justify-center text-coral group-hover:scale-110 transition-transform mb-5">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-ink dark:text-white">3D Flip Flashcards</h3>
            <p className="mt-2 text-sm text-neutral-muted dark:text-neutral-300 leading-relaxed">
              Study with tactile 3D card flips, spaced difficulty categorization (Easy, Medium, Difficult), shuffle decks, and keyboard shortcuts.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-7 rounded-3xl bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-800 shadow-card hover:shadow-card transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-mint/15 flex items-center justify-center text-mint group-hover:scale-110 transition-transform mb-5">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-ink dark:text-white">Exam-Aligned Study Plans</h3>
            <p className="mt-2 text-sm text-neutral-muted dark:text-neutral-300 leading-relaxed">
              Create balanced daily schedules leading up to your exams. Automatically weighs your actual weak topics from past quiz scores and respects your daily availability.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-border dark:border-ink-800 py-8 px-6 sm:px-12 bg-white dark:bg-ink-900 text-center text-xs text-neutral-muted flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-blue flex items-center justify-center text-white text-xs font-bold">
            <Sparkles className="h-3.5 w-3.5 text-sun fill-sun" />
          </div>
          <span className="font-semibold text-ink dark:text-white">StudySpark</span>
          <span>— Production AI Study Companion</span>
        </div>
        <p>© {new Date().getFullYear()} StudySpark. Built with React, Supabase & Claude.</p>
      </footer>
    </div>
  )
}
