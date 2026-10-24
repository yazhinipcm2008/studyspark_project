import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | 'default'
    | 'easy'
    | 'medium'
    | 'hard'
    | 'outline'
    | 'streak'
    | 'secondary'
    | 'blue'
    | 'coral'
    | 'sun'
    | 'mint'
    | 'sky'
    | 'pink'
    | 'violet'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-transparent',
    secondary: 'bg-neutral-bg dark:bg-ink-800 text-neutral-muted dark:text-neutral-200 border-neutral-border dark:border-ink-700',
    easy: 'bg-mint-100 dark:bg-mint-950/70 text-emerald-800 dark:text-mint-400 border-mint-200 dark:border-mint-800',
    medium: 'bg-sun-100 dark:bg-sun-950/70 text-amber-800 dark:text-sun-400 border-sun-200 dark:border-sun-800',
    hard: 'bg-coral-100 dark:bg-coral-950/70 text-rose-800 dark:text-coral-400 border-coral-200 dark:border-coral-800',
    streak: 'bg-gradient-streak text-ink-navy font-bold border-transparent shadow-sm',
    outline: 'border border-neutral-border dark:border-ink-800 text-ink dark:text-neutral-bg',

    blue: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    coral: 'bg-coral-100 dark:bg-coral-950/60 text-rose-800 dark:text-coral-400 border-coral-200 dark:border-coral-800',
    sun: 'bg-sun-100 dark:bg-sun-950/60 text-amber-800 dark:text-sun-400 border-sun-200 dark:border-sun-800',
    mint: 'bg-mint-100 dark:bg-mint-950/60 text-emerald-800 dark:text-mint-400 border-mint-200 dark:border-mint-800',
    sky: 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    pink: 'bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
    violet: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}
