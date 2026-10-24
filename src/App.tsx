import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { LandingPage } from '@/features/landing/LandingPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MaterialsPage } from '@/features/materials/MaterialsPage'
import { QuizzesPage } from '@/features/quizzes/QuizzesPage'
import { QuizTakingPage } from '@/features/quizzes/QuizTakingPage'
import { QuizResultsPage } from '@/features/quizzes/QuizResultsPage'
import { FlashcardSetsPage } from '@/features/flashcards/FlashcardSetsPage'
import { FlashcardStudyPage } from '@/features/flashcards/FlashcardStudyPage'
import { StudyPlannerPage } from '@/features/planner/StudyPlannerPage'
import { WeakTopicsPage } from '@/features/weak-topics/WeakTopicsPage'
import { ProgressAnalyticsPage } from '@/features/analytics/ProgressAnalyticsPage'
import { AIAssistantPage } from '@/features/assistant/AIAssistantPage'
import { RemindersPage } from '@/features/reminders/RemindersPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { StudyRoomLobbyPage } from '@/features/study-room/StudyRoomLobbyPage'
import { StudyRoomPage } from '@/features/study-room/StudyRoomPage'
import { FocusTimerPage } from '@/features/focus/FocusTimerPage'
import { ExamModePage } from '@/features/exam/ExamModePage'
import { NotFoundPage } from '@/components/common/NotFoundPage'

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected App Routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/focus" element={<FocusTimerPage />} />
              <Route path="/exam" element={<ExamModePage />} />
              <Route path="/quizzes" element={<QuizzesPage />} />
              <Route path="/quizzes/:id/take" element={<QuizTakingPage />} />
              <Route path="/quizzes/:id/results/:attemptId" element={<QuizResultsPage />} />
              <Route path="/flashcards" element={<FlashcardSetsPage />} />
              <Route path="/flashcards/:setId" element={<FlashcardStudyPage />} />
              <Route path="/planner" element={<StudyPlannerPage />} />
              <Route path="/weak-topics" element={<WeakTopicsPage />} />
              <Route path="/analytics" element={<ProgressAnalyticsPage />} />
              <Route path="/assistant" element={<AIAssistantPage />} />
              <Route path="/study-room" element={<StudyRoomLobbyPage />} />
              <Route path="/study-room/:roomId" element={<StudyRoomPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              className: 'rounded-2xl shadow-card font-sans text-xs',
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
