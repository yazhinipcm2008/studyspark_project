-- StudySpark Complete Database Schema Migration
-- Enables all required tables, triggers, RLS policies, and scoring functions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
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

-- 2. MATERIALS TABLE
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

-- 3. QUIZZES TABLE
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

-- 4. QUIZ QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  position integer NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false')),
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  explanation text,
  topic text
);

-- 5. QUIZ ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score_percent numeric(5,2) NOT NULL,
  correct_count integer NOT NULL,
  total_count integer NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed'))
);

-- 6. ATTEMPT ANSWERS TABLE
CREATE TABLE IF NOT EXISTS public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  selected_answer text NOT NULL,
  is_correct boolean NOT NULL,
  topic text
);

-- 7. FLASHCARD SETS TABLE
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

-- 8. FLASHCARDS TABLE
CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.flashcard_sets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  position integer NOT NULL,
  front text NOT NULL,
  back text NOT NULL,
  topic text,
  difficulty_rating text CHECK (difficulty_rating IN ('easy', 'medium', 'difficult')),
  times_reviewed integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz
);

-- 9. FLASHCARD REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  flashcard_id uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.flashcard_sets(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('easy', 'medium', 'difficult')),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

-- 10. STUDY PLANS TABLE
CREATE TABLE IF NOT EXISTS public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 11. STUDY TASKS TABLE
CREATE TABLE IF NOT EXISTS public.study_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  topic text NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('study', 'revision', 'practice')),
  scheduled_date date NOT NULL,
  start_time time,
  duration_minutes integer NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 12. STUDY SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  task_id uuid REFERENCES public.study_tasks(id) ON DELETE SET NULL,
  subject text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes integer NOT NULL,
  source text NOT NULL CHECK (source IN ('timer', 'task_completion', 'manual'))
);

-- 13. TOPIC PERFORMANCE TABLE
CREATE TABLE IF NOT EXISTS public.topic_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  topic text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  correct integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  score_percent numeric(5,2) NOT NULL DEFAULT 0,
  previous_score_percent numeric(5,2) NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topic_performance_unique_user_subject_topic UNIQUE (user_id, subject, topic)
);

-- 14. REMINDERS TABLE
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('session', 'task', 'exam', 'revision')),
  title text NOT NULL,
  remind_at timestamptz NOT NULL,
  related_task_id uuid REFERENCES public.study_tasks(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  delivered_at timestamptz
);

-- 15. REMINDER PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.reminder_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  session_lead_minutes integer NOT NULL DEFAULT 15,
  exam_lead_days jsonb NOT NULL DEFAULT '[1, 3, 7]'::jsonb,
  task_digest_enabled boolean NOT NULL DEFAULT true
);

-- 16. EXAMS TABLE
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  exam_date timestamptz NOT NULL,
  notes text
);

-- 17. POINTS LEDGER TABLE (Unique on user_id, event_type, source_id for strict idempotency)
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  event_type text NOT NULL,
  source_id uuid NOT NULL,
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT points_ledger_unique_event UNIQUE (user_id, event_type, source_id)
);

-- 18. ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievements_unique_badge UNIQUE (user_id, badge_key)
);

-- 19. AI CONVERSATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_materials_user ON public.materials(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user ON public.quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON public.attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_set ON public.flashcards(set_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_plan ON public.study_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_study_tasks_user_date ON public.study_tasks(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON public.study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_performance_user ON public.topic_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_due ON public.reminders(user_id, remind_at, enabled);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON public.points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON public.ai_messages(conversation_id);

-- UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_materials_updated_at ON public.materials;
CREATE TRIGGER set_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_flashcard_sets_updated_at ON public.flashcard_sets;
CREATE TRIGGER set_flashcard_sets_updated_at BEFORE UPDATE ON public.flashcard_sets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_study_plans_updated_at ON public.study_plans;
CREATE TRIGGER set_study_plans_updated_at BEFORE UPDATE ON public.study_plans FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_study_tasks_updated_at ON public.study_tasks;
CREATE TRIGGER set_study_tasks_updated_at BEFORE UPDATE ON public.study_tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- AUTO CREATE PROFILE ON USER SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, university, course, weekly_goal_minutes, daily_goal_minutes, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'university',
    NEW.raw_user_meta_data->>'course',
    720,
    120,
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.reminder_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Standard user isolation policies
DROP POLICY IF EXISTS "Users access own profiles" ON public.profiles;
CREATE POLICY "Users access own profiles" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users access own materials" ON public.materials;
CREATE POLICY "Users access own materials" ON public.materials FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own quizzes" ON public.quizzes;
CREATE POLICY "Users access own quizzes" ON public.quizzes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own questions" ON public.quiz_questions;
CREATE POLICY "Users access own questions" ON public.quiz_questions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own attempts" ON public.quiz_attempts;
CREATE POLICY "Users access own attempts" ON public.quiz_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users access own attempt answers" ON public.attempt_answers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own flashcard sets" ON public.flashcard_sets;
CREATE POLICY "Users access own flashcard sets" ON public.flashcard_sets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own flashcards" ON public.flashcards;
CREATE POLICY "Users access own flashcards" ON public.flashcards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own reviews" ON public.flashcard_reviews;
CREATE POLICY "Users access own reviews" ON public.flashcard_reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own study plans" ON public.study_plans;
CREATE POLICY "Users access own study plans" ON public.study_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own study tasks" ON public.study_tasks;
CREATE POLICY "Users access own study tasks" ON public.study_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own study sessions" ON public.study_sessions;
CREATE POLICY "Users access own study sessions" ON public.study_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own topic performance" ON public.topic_performance;
CREATE POLICY "Users access own topic performance" ON public.topic_performance FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own reminders" ON public.reminders;
CREATE POLICY "Users access own reminders" ON public.reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own reminder preferences" ON public.reminder_preferences;
CREATE POLICY "Users access own reminder preferences" ON public.reminder_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own exams" ON public.exams;
CREATE POLICY "Users access own exams" ON public.exams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only read own points ledger" ON public.points_ledger;
CREATE POLICY "Users can only read own points ledger" ON public.points_ledger FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only read own achievements" ON public.achievements;
CREATE POLICY "Users can only read own achievements" ON public.achievements FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users access own ai conversations" ON public.ai_conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own ai messages" ON public.ai_messages;
CREATE POLICY "Users access own ai messages" ON public.ai_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SECURITY DEFINER FUNCTION FOR POINTS & ACHIEVEMENTS (Prevents client manipulation)
CREATE OR REPLACE FUNCTION public.award_points_and_badges(
  p_user_id uuid,
  p_event_type text,
  p_source_id uuid,
  p_points integer
)
RETURNS jsonb AS $$
DECLARE
  v_inserted boolean := false;
  v_total_points integer := 0;
  v_quiz_count integer := 0;
  v_new_badges text[] := '{}';
BEGIN
  -- Insert into points ledger idempotently
  INSERT INTO public.points_ledger (user_id, event_type, source_id, points)
  VALUES (p_user_id, p_event_type, p_source_id, p_points)
  ON CONFLICT (user_id, event_type, source_id) DO NOTHING;

  IF FOUND THEN
    v_inserted := true;
  END IF;

  -- Calculate total points
  SELECT COALESCE(SUM(points), 0) INTO v_total_points
  FROM public.points_ledger
  WHERE user_id = p_user_id;

  -- Check Quiz badges
  SELECT COUNT(*) INTO v_quiz_count
  FROM public.quiz_attempts
  WHERE user_id = p_user_id AND status = 'completed';

  IF v_quiz_count >= 1 THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'first_quiz')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'first_quiz'); END IF;
  END IF;

  IF v_quiz_count >= 5 THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'five_quizzes')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'five_quizzes'); END IF;
  END IF;

  -- Check Perfect Score badge
  IF p_event_type = 'quiz_perfect' THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'perfect_score')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'perfect_score'); END IF;
  END IF;

  -- Check First Flashcard Set badge
  IF p_event_type = 'flashcard_set_reviewed' THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'first_flashcard_set')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'first_flashcard_set'); END IF;
  END IF;

  -- Check 100 Cards Reviewed
  IF (SELECT COALESCE(SUM(times_reviewed), 0) FROM public.flashcards WHERE user_id = p_user_id) >= 100 THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'hundred_cards_reviewed')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'hundred_cards_reviewed'); END IF;
  END IF;

  -- Check First Plan Completed
  IF (SELECT COUNT(*) FROM public.study_plans WHERE user_id = p_user_id) >= 1 THEN
    INSERT INTO public.achievements (user_id, badge_key)
    VALUES (p_user_id, 'first_plan')
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    IF FOUND THEN v_new_badges := array_append(v_new_badges, 'first_plan'); END IF;
  END IF;

  RETURN jsonb_build_object(
    'awarded', v_inserted,
    'points', p_points,
    'total_points', v_total_points,
    'new_badges', v_new_badges
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURE SERVER-SIDE QUIZ SCORING FUNCTION
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb, -- array of { question_id, selected_answer }
  p_duration_seconds integer DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_question RECORD;
  v_total_questions integer := 0;
  v_correct_count integer := 0;
  v_score_percent numeric(5,2) := 0;
  v_attempt_id uuid;
  v_ans jsonb;
  v_is_correct boolean;
  v_selected text;
  v_topic text;
  v_subject text;
  v_points integer := 20;
  v_reward jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subject INTO v_subject FROM public.quizzes WHERE id = p_quiz_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found or unauthorized';
  END IF;

  SELECT COUNT(*) INTO v_total_questions FROM public.quiz_questions WHERE quiz_id = p_quiz_id;
  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Quiz has no questions';
  END IF;

  -- Pre-create attempt
  INSERT INTO public.quiz_attempts (user_id, quiz_id, score_percent, correct_count, total_count, duration_seconds, status)
  VALUES (v_user_id, p_quiz_id, 0, 0, v_total_questions, p_duration_seconds, 'in_progress')
  RETURNING id INTO v_attempt_id;

  -- Evaluate each answer strictly against quiz_questions correct_answer
  FOR v_question IN SELECT id, correct_answer, topic FROM public.quiz_questions WHERE quiz_id = p_quiz_id LOOP
    v_selected := NULL;
    FOR i IN 0 .. jsonb_array_length(p_answers) - 1 LOOP
      v_ans := p_answers->i;
      IF (v_ans->>'question_id')::uuid = v_question.id THEN
        v_selected := v_ans->>'selected_answer';
        EXIT;
      END IF;
    END LOOP;

    v_is_correct := (TRIM(LOWER(COALESCE(v_selected, ''))) = TRIM(LOWER(v_question.correct_answer)));
    IF v_is_correct THEN
      v_correct_count := v_correct_count + 1;
    END IF;

    INSERT INTO public.attempt_answers (attempt_id, question_id, user_id, selected_answer, is_correct, topic)
    VALUES (v_attempt_id, v_question.id, v_user_id, COALESCE(v_selected, ''), v_is_correct, v_question.topic);

    -- Update topic performance
    IF v_question.topic IS NOT NULL AND trim(v_question.topic) <> '' THEN
      INSERT INTO public.topic_performance (user_id, subject, topic, attempts, correct, total, score_percent, previous_score_percent, last_updated)
      VALUES (
        v_user_id,
        COALESCE(v_subject, 'General'),
        v_question.topic,
        1,
        CASE WHEN v_is_correct THEN 1 ELSE 0 END,
        1,
        CASE WHEN v_is_correct THEN 100.0 ELSE 0.0 END,
        0,
        now()
      )
      ON CONFLICT (user_id, subject, topic) DO UPDATE SET
        attempts = public.topic_performance.attempts + 1,
        correct = public.topic_performance.correct + (CASE WHEN EXCLUDED.correct > 0 THEN 1 ELSE 0 END),
        total = public.topic_performance.total + 1,
        previous_score_percent = public.topic_performance.score_percent,
        score_percent = ROUND(((public.topic_performance.correct + (CASE WHEN EXCLUDED.correct > 0 THEN 1 ELSE 0 END))::numeric / (public.topic_performance.total + 1)::numeric) * 100, 2),
        last_updated = now();
    END IF;
  END LOOP;

  v_score_percent := ROUND((v_correct_count::numeric / v_total_questions::numeric) * 100, 2);

  UPDATE public.quiz_attempts
  SET score_percent = v_score_percent,
      correct_count = v_correct_count,
      status = 'completed',
      completed_at = now()
  WHERE id = v_attempt_id;

  -- Points calculation: 20 base points, +10 bonus for >=80%, +20 bonus for 100%
  IF v_score_percent >= 100 THEN
    v_points := 40;
    v_reward := public.award_points_and_badges(v_user_id, 'quiz_perfect', v_attempt_id, v_points);
  ELSIF v_score_percent >= 80 THEN
    v_points := 30;
    v_reward := public.award_points_and_badges(v_user_id, 'quiz_high_score', v_attempt_id, v_points);
  ELSE
    v_points := 20;
    v_reward := public.award_points_and_badges(v_user_id, 'quiz_completed', v_attempt_id, v_points);
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'quiz_id', p_quiz_id,
    'score_percent', v_score_percent,
    'correct_count', v_correct_count,
    'total_count', v_total_questions,
    'points_awarded', v_points,
    'reward_details', v_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STORAGE BUCKET CONFIGURATION (Run in Supabase SQL editor)
-- Creates private study-materials bucket and strict path policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-materials', 'study-materials', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated users to read own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to read own materials"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'study-materials'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Allow authenticated users to upload own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload own materials"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'study-materials'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Allow authenticated users to delete own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own materials"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'study-materials'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- RELOAD SUPABASE POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

