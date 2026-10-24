-- ==============================================================================
-- Migration: Create materials table and configure storage & RLS policies
-- Description: Creates the public.materials table, indexes, triggers,
--              Row Level Security (RLS) policies, and private storage bucket
-- ==============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create public.materials table
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('file', 'paste')),
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  extracted_text text,
  text_length integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  error_message text,
  subject text DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist (in case the table was created partially before)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'user_id') THEN
    ALTER TABLE public.materials ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'title') THEN
    ALTER TABLE public.materials ADD COLUMN title text NOT NULL DEFAULT 'Untitled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'source_type') THEN
    ALTER TABLE public.materials ADD COLUMN source_type text NOT NULL DEFAULT 'file';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'file_path') THEN
    ALTER TABLE public.materials ADD COLUMN file_path text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'file_name') THEN
    ALTER TABLE public.materials ADD COLUMN file_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'file_type') THEN
    ALTER TABLE public.materials ADD COLUMN file_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'file_size') THEN
    ALTER TABLE public.materials ADD COLUMN file_size bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'extracted_text') THEN
    ALTER TABLE public.materials ADD COLUMN extracted_text text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'text_length') THEN
    ALTER TABLE public.materials ADD COLUMN text_length integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'status') THEN
    ALTER TABLE public.materials ADD COLUMN status text NOT NULL DEFAULT 'processing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'error_message') THEN
    ALTER TABLE public.materials ADD COLUMN error_message text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'subject') THEN
    ALTER TABLE public.materials ADD COLUMN subject text DEFAULT 'General';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'created_at') THEN
    ALTER TABLE public.materials ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'updated_at') THEN
    ALTER TABLE public.materials ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_materials_user ON public.materials(user_id);
CREATE INDEX IF NOT EXISTS idx_materials_status ON public.materials(status);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON public.materials(created_at DESC);

-- 5. Auto-update timestamp trigger
DROP TRIGGER IF EXISTS set_materials_updated_at ON public.materials;
CREATE TRIGGER set_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- 7. Configure RLS Policies for user isolation
DROP POLICY IF EXISTS "Users access own materials" ON public.materials;
DROP POLICY IF EXISTS "Users can view own materials" ON public.materials;
DROP POLICY IF EXISTS "Users can insert own materials" ON public.materials;
DROP POLICY IF EXISTS "Users can update own materials" ON public.materials;
DROP POLICY IF EXISTS "Users can delete own materials" ON public.materials;

CREATE POLICY "Users access own materials"
  ON public.materials
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Storage bucket setup for private study materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-materials', 'study-materials', false)
ON CONFLICT (id) DO NOTHING;

-- Storage object RLS policies (user folder isolation: {user_id}/{material_id}/{filename})
DROP POLICY IF EXISTS "Allow authenticated users to read own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to read own materials"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'study-materials'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Allow authenticated users to upload own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload own materials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'study-materials'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Allow authenticated users to update own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to update own materials"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'study-materials'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Allow authenticated users to delete own materials" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own materials"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'study-materials'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 9. Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
