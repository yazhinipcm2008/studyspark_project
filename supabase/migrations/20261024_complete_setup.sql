-- StudySpark Database Setup (100% Validated & Idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (Uses 'id' as the user's auth ID)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  university text,
  course text,
  weekly_goal_minutes integer NOT NULL DEFAULT 720,
  daily_goal_minutes integer NOT NULL DEFAULT 120,
  theme text NOT NULL DEFAULT 'light',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. MATERIALS
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('file', 'paste')),
  file_path text,
  file_name text,
  file_type text,
  file_size integer,
  extracted_text text,
  text_length integer DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  error_message text,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. FLASHCARD SETS & FLASHCARDS
CREATE TABLE IF NOT EXISTS public.flashcard_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  title text NOT NULL,
  subject text,
  card_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.flashcard_sets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  position integer NOT NULL,
  front text NOT NULL,
  back text NOT NULL,
  topic text,
  difficulty text DEFAULT 'medium',
  last_studied timestamptz,
  next_review timestamptz,
  interval_days integer DEFAULT 1,
  ease_factor numeric DEFAULT 2.5,
  times_reviewed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. QUIZZES & QUESTIONS
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  title text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false')),
  num_questions integer NOT NULL,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  position integer NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false')),
  options jsonb,
  correct_answer text NOT NULL,
  explanation text,
  topic text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  score integer NOT NULL,
  total_questions integer NOT NULL,
  percentage numeric NOT NULL,
  time_spent_seconds integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. STUDY PLANS & TASKS
CREATE TABLE IF NOT EXISTS public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  topic text NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('study', 'revision', 'practice')),
  scheduled_date date NOT NULL,
  start_time time,
  duration_minutes integer NOT NULL DEFAULT 45,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. AI CONVERSATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. TOPIC PERFORMANCE & REWARDS
CREATE TABLE IF NOT EXISTS public.topic_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  topic text NOT NULL,
  correct integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  score_percent numeric GENERATED ALWAYS AS (CASE WHEN total > 0 THEN (correct::numeric / total::numeric) * 100 ELSE 0 END) STORED,
  last_tested timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject, topic)
);

CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  task_id uuid REFERENCES public.study_tasks(id) ON DELETE SET NULL,
  duration_minutes integer NOT NULL,
  subject text,
  notes text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  points integer NOT NULL,
  reason text NOT NULL,
  source_type text,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  badge_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  description text,
  remind_at timestamptz NOT NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- 8. INDIVIDUAL RLS POLICIES (Matches actual primary keys)

-- Profiles (uses 'id')
DROP POLICY IF EXISTS "Users can manage own profiles" ON public.profiles;
CREATE POLICY "Users can manage own profiles" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Materials
DROP POLICY IF EXISTS "Users can manage own materials" ON public.materials;
CREATE POLICY "Users can manage own materials" ON public.materials FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Flashcard Sets
DROP POLICY IF EXISTS "Users can manage own flashcard sets" ON public.flashcard_sets;
CREATE POLICY "Users can manage own flashcard sets" ON public.flashcard_sets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Flashcards
DROP POLICY IF EXISTS "Users can manage own flashcards" ON public.flashcards;
CREATE POLICY "Users can manage own flashcards" ON public.flashcards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quizzes
DROP POLICY IF EXISTS "Users can manage own quizzes" ON public.quizzes;
CREATE POLICY "Users can manage own quizzes" ON public.quizzes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quiz Questions
DROP POLICY IF EXISTS "Users can manage own quiz questions" ON public.quiz_questions;
CREATE POLICY "Users can manage own quiz questions" ON public.quiz_questions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quiz Attempts
DROP POLICY IF EXISTS "Users can manage own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Users can manage own quiz attempts" ON public.quiz_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Study Plans
DROP POLICY IF EXISTS "Users can manage own study plans" ON public.study_plans;
CREATE POLICY "Users can manage own study plans" ON public.study_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Study Tasks
DROP POLICY IF EXISTS "Users can manage own study tasks" ON public.study_tasks;
CREATE POLICY "Users can manage own study tasks" ON public.study_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI Conversations
DROP POLICY IF EXISTS "Users can manage own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can manage own ai conversations" ON public.ai_conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI Messages
DROP POLICY IF EXISTS "Users can manage own ai messages" ON public.ai_messages;
CREATE POLICY "Users can manage own ai messages" ON public.ai_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Topic Performance
DROP POLICY IF EXISTS "Users can manage own topic performance" ON public.topic_performance;
CREATE POLICY "Users can manage own topic performance" ON public.topic_performance FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Study Sessions
DROP POLICY IF EXISTS "Users can manage own study sessions" ON public.study_sessions;
CREATE POLICY "Users can manage own study sessions" ON public.study_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Points Ledger
DROP POLICY IF EXISTS "Users can manage own points ledger" ON public.points_ledger;
CREATE POLICY "Users can manage own points ledger" ON public.points_ledger FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Achievements
DROP POLICY IF EXISTS "Users can manage own achievements" ON public.achievements;
CREATE POLICY "Users can manage own achievements" ON public.achievements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reminders
DROP POLICY IF EXISTS "Users can manage own reminders" ON public.reminders;
CREATE POLICY "Users can manage own reminders" ON public.reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
