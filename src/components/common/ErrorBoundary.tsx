import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('StudySpark Error Boundary caught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-bg dark:bg-ink-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="h-16 w-16 rounded-3xl bg-destructive-50 dark:bg-destructive/20 text-destructive mx-auto flex items-center justify-center">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-ink dark:text-white">Something went wrong</h2>
            <p className="text-xs text-neutral-muted leading-relaxed">
              An unexpected error occurred in this view. Your saved data is secure in Supabase.
            </p>
            {this.state.error && (
              <div className="p-3 bg-neutral-bg dark:bg-ink-900 rounded-xl text-left font-mono text-[11px] text-destructive overflow-x-auto">
                {this.state.error.message}
              </div>
            )}
            <Button
              variant="signature"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/dashboard'
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Reload Application
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
