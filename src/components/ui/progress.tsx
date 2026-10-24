import * as React from 'react'
import { cn } from '@/lib/utils'

export function Progress({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
}: {
  value?: number
  max?: number
  className?: string
  indicatorClassName?: string
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-neutral-border/60 dark:bg-ink-800',
        className
      )}
    >
      <div
        className={cn(
          'h-full w-full flex-1 bg-gradient-signature transition-all duration-300 ease-in-out',
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  )
}
