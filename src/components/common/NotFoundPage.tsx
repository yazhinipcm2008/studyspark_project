import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="h-16 w-16 rounded-3xl bg-primary-100 dark:bg-primary-950/60 text-primary mx-auto flex items-center justify-center">
          <Compass className="h-8 w-8" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-ink dark:text-white">404</h1>
        <h2 className="text-lg font-bold text-ink dark:text-white">Page Not Found</h2>
        <p className="text-xs text-neutral-muted leading-relaxed">
          The requested page does not exist or has been moved. Let's get you back to your study sessions.
        </p>
        <div className="pt-2">
          <Button variant="signature" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
