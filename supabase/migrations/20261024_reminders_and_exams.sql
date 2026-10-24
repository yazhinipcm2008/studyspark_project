-- StudySpark Fix: Complete Reminders, Exams, and Reviews Schema
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS related_task_id uuid REFERENCES public.study_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Reminder Preferences
CREATE TABLE IF NOT EXISTS public.reminder_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  session_lead_minutes integer NOT NULL DEFAULT 15,
  exam_lead_days jsonb NOT NULL DEFAULT '[1, 3, 7]'::jsonb,
  task_digest_enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.reminder_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own reminder preferences" ON public.reminder_preferences;
CREATE POLICY "Users can manage own reminder preferences" ON public.reminder_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Exams
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL,
  exam_date timestamptz NOT NULL,
  notes text
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own exams" ON public.exams;
CREATE POLICY "Users can manage own exams" ON public.exams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Flashcards Spaced Repetition Columns & Reviews
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS difficulty_rating text DEFAULT 'medium';
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  flashcard_id uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.flashcard_sets(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('easy', 'medium', 'difficult')),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own flashcard reviews" ON public.flashcard_reviews;
CREATE POLICY "Users can manage own flashcard reviews" ON public.flashcard_reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
