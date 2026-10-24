export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  university: string | null
  course: string | null
  weekly_goal_minutes: number
  daily_goal_minutes: number
  theme: 'light' | 'dark'
  timezone: string
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  user_id: string
  title: string
  source_type: 'file' | 'paste' | 'audio' | 'video' | 'youtube'
  file_path: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  extracted_text: string | null
  text_length: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  error_message: string | null
  subject: string | null
  created_at: string
  updated_at: string
}

export interface Quiz {
  id: string
  user_id: string
  material_id: string | null
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  question_type: 'multiple_choice' | 'true_false'
  num_questions: number
  subject: string | null
  created_at: string
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  user_id: string
  position: number
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  options: string[]
  correct_answer: string
  explanation: string | null
  topic: string | null
  source_passage?: string | null
  source_page?: number | null
  material_id?: string | null
  material_title?: string | null
}

export interface QuizAttempt {
  id: string
  user_id: string
  quiz_id: string
  score_percent: number
  correct_count: number
  total_count: number
  duration_seconds: number
  started_at: string
  completed_at: string
  status: 'in_progress' | 'completed'
  // joined fields
  quiz?: Quiz
}

export interface AttemptAnswer {
  id: string
  attempt_id: string
  question_id: string
  user_id: string
  selected_answer: string
  is_correct: boolean
  topic: string | null
  time_spent_seconds?: number
  question?: QuizQuestion
}

export interface FlashcardSet {
  id: string
  user_id: string
  material_id: string | null
  title: string
  subject: string | null
  card_count: number
  created_at: string
  updated_at: string
}

export interface Flashcard {
  id: string
  set_id: string
  user_id: string
  position: number
  front: string
  back: string
  topic: string | null
  difficulty_rating: 'easy' | 'medium' | 'difficult' | null
  times_reviewed: number
  last_reviewed_at: string | null
}

export interface FlashcardReview {
  id: string
  user_id: string
  flashcard_id: string
  set_id: string
  rating: 'easy' | 'medium' | 'difficult'
  reviewed_at: string
}

export interface StudyPlan {
  id: string
  user_id: string
  title: string
  start_date: string
  end_date: string
  config: Json
  created_at: string
  updated_at: string
}

export interface StudyTask {
  id: string
  plan_id: string
  user_id: string
  subject: string
  topic: string
  task_type: 'study' | 'revision' | 'practice'
  scheduled_date: string
  start_time: string | null
  duration_minutes: number
  priority: 'low' | 'medium' | 'high'
  completed: boolean
  completed_at: string | null
  notes: string | null
  updated_at: string
}

export interface StudySession {
  id: string
  user_id: string
  task_id: string | null
  subject: string
  started_at: string
  ended_at: string
  duration_minutes: number
  source: 'timer' | 'task_completion' | 'manual'
}

export interface TopicPerformance {
  id: string
  user_id: string
  subject: string
  topic: string
  attempts: number
  correct: number
  total: number
  score_percent: number
  previous_score_percent: number
  last_updated: string
}

export interface Reminder {
  id: string
  user_id: string
  kind: 'session' | 'task' | 'exam' | 'revision'
  title: string
  remind_at: string
  related_task_id: string | null
  enabled: boolean
  delivered_at: string | null
}

export interface ReminderPreferences {
  user_id: string
  in_app_enabled: boolean
  browser_enabled: boolean
  session_lead_minutes: number
  exam_lead_days: number[]
  task_digest_enabled: boolean
}

export interface Exam {
  id: string
  user_id: string
  subject: string
  exam_date: string
  notes: string | null
}

export interface PointsLedger {
  id: string
  user_id: string
  event_type: string
  source_id: string
  points: number
  created_at: string
}

export interface Achievement {
  id: string
  user_id: string
  badge_key: string
  earned_at: string
}

export interface AIConversation {
  id: string
  user_id: string
  title: string
  material_id: string | null
  created_at: string
}

export interface AIMessage {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  source_passage?: string | null
  source_page?: number | null
  material_id?: string | null
  material_title?: string | null
  created_at: string
}

export interface ExamQuestionResult {
  question_id: string
  position: number
  question_text: string
  options: string[]
  selected_answer: string
  correct_answer: string
  is_correct: boolean
  topic: string
  material_id?: string | null
  material_title?: string | null
  time_spent_seconds: number
  explanation: string
  flagged?: boolean
}

export interface ExamSimulationAttempt {
  id: string
  user_id: string
  title: string
  material_ids: string[]
  total_questions: number
  time_limit_minutes: number
  duration_seconds: number
  score_percent: number
  correct_count: number
  started_at: string
  completed_at: string
  topic_breakdown: Record<string, { total: number; correct: number; total_time_seconds: number }>
  question_results: ExamQuestionResult[]
}
