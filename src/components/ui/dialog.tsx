import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  confirmText?: string
  confirmVariant?: 'primary' | 'destructive' | 'signature' | 'blue' | 'coral' | 'sun' | 'mint' | 'sky' | 'pink' | 'violet'
  onConfirm?: () => void
  isConfirmLoading?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmText,
  confirmVariant = 'primary',
  onConfirm,
  isConfirmLoading,
}: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Content */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border p-6 shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-200'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-ink dark:text-white">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-neutral-muted dark:text-neutral-300">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-neutral-muted hover:bg-neutral-bg dark:hover:bg-surface hover:text-ink dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {(confirmText || onConfirm) && (
          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-neutral-border dark:border-neutral-border">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isConfirmLoading}>
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
              size="sm"
              isLoading={isConfirmLoading}
              onClick={() => onConfirm?.()}
            >
              {confirmText || 'Confirm'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
