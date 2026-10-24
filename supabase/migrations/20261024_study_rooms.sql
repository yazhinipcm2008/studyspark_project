-- Study Rooms migration for Collaborative Study Workspace
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(16) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  topic VARCHAR(255),
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  code_content TEXT DEFAULT '// Write or paste code here to collaborate with peers in real-time\nconsole.log("Welcome to StudySpark Common Workspace!");',
  code_language VARCHAR(32) DEFAULT 'javascript',
  notes_content TEXT DEFAULT '# Study Room Shared Notes\n\n- Topic:\n- Key Concepts:\n- Questions to Discuss:\n',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view active rooms
CREATE POLICY "Allow authenticated read study_rooms" ON public.study_rooms
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to create rooms
CREATE POLICY "Allow authenticated insert study_rooms" ON public.study_rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Allow authenticated users to update rooms (for collaborative note/code sync)
CREATE POLICY "Allow authenticated update study_rooms" ON public.study_rooms
  FOR UPDATE TO authenticated USING (true);

-- Index for fast room_code lookup
CREATE INDEX IF NOT EXISTS idx_study_rooms_code ON public.study_rooms(room_code);
