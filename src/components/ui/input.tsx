import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'flex h-11 w-full rounded-xl border bg-white dark:bg-ink-900 px-3.5 py-2 text-sm text-ink dark:text-white placeholder:text-neutral-muted/60 transition-colors duration-150',
            'border-neutral-border dark:border-ink-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-destructive font-medium">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
