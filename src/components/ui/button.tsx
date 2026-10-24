import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'destructive'
    | 'warm'
    | 'cool'
    | 'signature'
    | 'blue'
    | 'coral'
    | 'mint'
    | 'sun'
    | 'sky'
    | 'pink'
    | 'violet'
    | 'blue-subtle'
    | 'coral-subtle'
    | 'mint-subtle'
    | 'sun-subtle'
    | 'sky-subtle'
    | 'pink-subtle'
    | 'violet-subtle'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none'

    const sizeStyles = {
      sm: 'text-xs px-3 py-1.5 h-8 gap-1.5',
      md: 'text-sm px-4 py-2 h-10 gap-2',
      lg: 'text-base px-6 py-3 h-12 gap-2.5 font-semibold',
      icon: 'h-10 w-10 p-0',
    }

    const variantStyles = {
      primary: 'bg-blue text-white hover:bg-blue-600 shadow-sm font-semibold',
      blue: 'bg-blue text-white hover:bg-blue-600 shadow-sm font-semibold',
      signature: 'bg-gradient-hero text-white hover:opacity-95 shadow-sm border-none font-semibold',
      secondary: 'bg-blue/10 dark:bg-surface-elevated text-blue hover:bg-blue/20 font-semibold',
      outline: 'border border-neutral-border dark:border-ink-800 bg-white dark:bg-ink-900 text-ink dark:text-ink-dark hover:bg-neutral-bg dark:hover:bg-ink-800 font-semibold',
      ghost: 'text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-ink-800 font-medium',
      destructive: 'bg-coral text-ink-navy font-bold hover:bg-coral-600 shadow-sm',
      warm: 'bg-sun text-ink-navy font-bold hover:bg-sun-400 shadow-sm',
      cool: 'bg-mint text-ink-navy font-bold hover:bg-mint-400 shadow-sm',
      coral: 'bg-coral text-ink-navy font-bold hover:bg-coral-600 shadow-sm',
      mint: 'bg-mint text-ink-navy font-bold hover:bg-mint-400 shadow-sm',
      sun: 'bg-sun text-ink-navy font-bold hover:bg-sun-400 shadow-sm',
      sky: 'bg-sky text-ink-navy font-bold hover:bg-sky-400 shadow-sm',
      pink: 'bg-pink text-ink-navy font-bold hover:bg-pink-400 shadow-sm',
      violet: 'bg-violet text-white font-bold hover:bg-violet-600 shadow-sm',
      'blue-subtle': 'bg-blue/15 text-blue dark:text-blue-400 border border-blue/30 hover:bg-blue hover:text-white font-bold shadow-xs transition-all',
      'coral-subtle': 'bg-coral/15 text-coral dark:text-coral-400 border border-coral/30 hover:bg-coral hover:text-ink-navy font-bold shadow-xs transition-all',
      'mint-subtle': 'bg-mint/15 text-mint dark:text-mint-400 border border-mint/30 hover:bg-mint hover:text-ink-navy font-bold shadow-xs transition-all',
      'sun-subtle': 'bg-sun/15 text-sun-700 dark:text-sun-400 border border-sun/30 hover:bg-sun hover:text-ink-navy font-bold shadow-xs transition-all',
      'sky-subtle': 'bg-sky/15 text-sky-700 dark:text-sky-400 border border-sky/30 hover:bg-sky hover:text-ink-navy font-bold shadow-xs transition-all',
      'pink-subtle': 'bg-pink/15 text-pink dark:text-pink-400 border border-pink/30 hover:bg-pink hover:text-ink-navy font-bold shadow-xs transition-all',
      'violet-subtle': 'bg-violet/15 text-violet dark:text-violet-400 border border-violet/30 hover:bg-violet hover:text-white font-bold shadow-xs transition-all',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
