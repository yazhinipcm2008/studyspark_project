# StudySpark ⚡ — AI Study Companion

StudySpark is a production-quality, responsive AI study web application designed to help college students study smarter using AI-generated quizzes, interactive 3D flashcards, personalized study plans, collaborative video study rooms, and actionable progress analytics.

---

## 🎨 Tech Stack & Architecture

- **Frontend:** React 19 + Vite + TypeScript, React Router 7, Tailwind CSS, Lucide React, Recharts, Sonner
- **Design System:** "Bright Spectrum" Multi-Hue System
  - **Blue (`#3B82F6`):** Home, Quizzes, Primary Buttons
  - **Coral (`#FF6B57`):** Focus Timer, Flashcards, Weak Topics (Alert)
  - **Sun (`#FFB400`):** Exam Mode, Reminders, Streaks, Points
  - **Mint (`#14C38E`):** Study Planner, Progress Analytics, Success
  - **Sky (`#22C5E8`):** Study Materials, Audio & Video Sources
  - **Pink (`#EC4899`):** Study Rooms (Collaborative Video & Workspaces)
  - **Violet (`#8B5CF6`):** AI Assistant (*Exclusively reserved for AI*)
  - **Neutrals:** Light background `#FBFAF7`, Surface `#FFFFFF`, Border `#E8E4DC` / Dark background `#0E1426`, Surface `#161E36`, Border `#2B3760`
  - **Accessibility:** Full WCAG AA contrast compliance (navy `#1B2559` on coral, sun, mint, sky, and pink; white on blue and violet)
- **Database & Backend:** Supabase (Postgres, Auth, Private Storage, Edge Functions)
- **AI Engine:** Claude API invoked exclusively from Supabase Edge Functions with secret `ANTHROPIC_API_KEY`
- **Text & Media Extraction:** In-browser extraction with `pdfjs-dist` (PDFs), `mammoth` (DOCX), direct FileReader (`.txt`, `.md`), and media audio/video transcript processing
- **Offline / PWA:** `vite-plugin-pwa` (Service Worker) + IndexedDB (`idb`) with an offline mutation outbox and automatic reconciliation on reconnect.

---

## 🚀 Setup & Deployment Checklist

### 1. Database Schema & RLS Setup
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase project dashboard.
3. Run the complete migration file located at:
   `supabase/migrations/20261024000000_studyspark_schema.sql`
   *(This creates all tables, row level security policies, updated_at triggers, and server scoring functions).*

### 2. Configure Supabase Secrets (Claude API)
In your Supabase project settings or via the Supabase CLI:
```bash
npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-api03-..."
npx supabase secrets set CLAUDE_MODEL="claude-sonnet-5-5"
```

### 3. Deploy Supabase Edge Functions
Deploy the 5 production functions:
```bash
npx supabase functions deploy generate-quiz
npx supabase functions deploy generate-flashcards
npx supabase functions deploy generate-study-plan
npx supabase functions deploy ai-assistant
npx supabase functions deploy award-points
```

### 4. Storage Bucket
The `study-materials` private storage bucket and path isolation policies are automatically created by the migration script:
- Path format: `{user_id}/{material_id}/{filename}`
- Preview URLs are generated via secure signed URLs.

### 5. Frontend Environment Variables
In the project root directory, create a `.env` file:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 💻 Running the App Locally

```bash
# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev

# 3. Production build
npm run build
```
The application will be live at `http://localhost:5173/`.
