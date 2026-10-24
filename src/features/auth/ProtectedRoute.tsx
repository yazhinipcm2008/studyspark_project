import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Skeleton } from '@/components/ui/skeleton'
import { SetupGuide } from '@/features/settings/SetupGuide'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, isConfigured, missingConfig } = useAuth()
  const location = useLocation()

  if (!isConfigured) {
    return <SetupGuide missingItems={missingConfig} />
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-6 bg-neutral-bg dark:bg-ink-950">
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-signature flex items-center justify-center text-white font-bold text-xl shadow-glow-violet animate-pulse">
            S
          </div>
          <h2 className="text-lg font-semibold text-ink dark:text-white">Connecting to StudySpark...</h2>
          <Skeleton className="h-4 w-3/4 mx-auto" />
          <Skeleton className="h-4 w-1/2 mx-auto" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
