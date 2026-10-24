import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  ExternalLink,
  Sparkles,
  FileText,
  Copy,
  Check,
  Search,
  ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Material } from '@/types/database'

interface MaterialPassageViewerModalProps {
  open: boolean
  onClose: () => void
  materialId?: string | null
  materialTitle?: string | null
  passage?: string | null
  pageNumber?: number | null
}

export const MaterialPassageViewerModal: React.FC<MaterialPassageViewerModalProps> = ({
  open,
  onClose,
  materialId,
  materialTitle,
  passage,
  pageNumber,
}) => {
  const navigate = useNavigate()
  const [material, setMaterial] = useState<Material | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const highlightRef = useRef<HTMLElement>(null)

  // Fetch full material text if needed
  useEffect(() => {
    if (!open || !materialId) return

    let isMounted = true
    const fetchMaterial = async () => {
      setIsLoading(true)
      try {
        const { data } = await supabase
          .from('materials')
          .select('*')
          .eq('id', materialId)
          .maybeSingle()

        if (isMounted && data) {
          setMaterial(data as Material)
        }
      } catch (err) {
        console.warn('Could not load material for citation:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchMaterial()

    return () => {
      isMounted = false
    }
  }, [open, materialId])

  // Auto-scroll to highlighted mark
  useEffect(() => {
    if (open && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 250)
    }
  }, [open, material, passage])

  const effectiveTitle = materialTitle || material?.title || 'Study Material'
  const fullText = material?.extracted_text || passage || 'No text content available.'

  // Determine page number if not explicitly passed
  let resolvedPage = pageNumber
  if (!resolvedPage && passage && material?.extracted_text) {
    const idx = material.extracted_text.toLowerCase().indexOf(passage.slice(0, 30).toLowerCase())
    if (idx !== -1) {
      resolvedPage = Math.floor(idx / 1800) + 1
    } else {
      resolvedPage = 1
    }
  }

  const handleCopyPassage = () => {
    if (passage) {
      navigator.clipboard.writeText(passage)
      setCopied(true)
      toast.success('Passage copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenInMaterials = () => {
    onClose()
    if (materialId) {
      navigate(`/materials?id=${materialId}&highlight=${encodeURIComponent(passage || '')}`)
    } else {
      navigate('/materials')
    }
  }

  // Render text with highlighted passage
  const renderHighlightedContent = () => {
    if (!passage || !passage.trim()) {
      return <span>{fullText}</span>
    }

    const cleanPassage = passage.trim()
    const lowerText = fullText.toLowerCase()
    const lowerPassage = cleanPassage.toLowerCase()
    const matchIndex = lowerText.indexOf(lowerPassage)

    if (matchIndex === -1) {
      // Fuzzy prefix match if exact paragraph differs slightly
      const shortPrefix = cleanPassage.slice(0, 35).toLowerCase()
      const prefixIndex = lowerText.indexOf(shortPrefix)

      if (prefixIndex !== -1) {
        const before = fullText.slice(0, prefixIndex)
        const match = fullText.slice(prefixIndex, prefixIndex + cleanPassage.length)
        const after = fullText.slice(prefixIndex + cleanPassage.length)
        return (
          <>
            {before}
            <mark
              ref={highlightRef}
              className="bg-sky-200/90 dark:bg-sky-900/70 text-ink dark:text-white border-b-2 border-sky font-bold px-1.5 py-0.5 rounded shadow-sm inline"
            >
              {match}
            </mark>
            {after}
          </>
        )
      }

      // If passage couldn't be located in text, show passage banner up top + full text
      return (
        <>
          <div className="mb-4 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200">
            <span className="font-bold block mb-1">Referenced Passage:</span>
            <p className="italic font-mono">"{cleanPassage}"</p>
          </div>
          <span>{fullText}</span>
        </>
      )
    }

    const before = fullText.slice(0, matchIndex)
    const match = fullText.slice(matchIndex, matchIndex + cleanPassage.length)
    const after = fullText.slice(matchIndex + cleanPassage.length)

    return (
      <>
        {before}
        <mark
          ref={highlightRef}
          className="bg-sky-200/90 dark:bg-sky-900/70 text-ink dark:text-white border-b-2 border-sky font-bold px-1.5 py-0.5 rounded inline animate-pulse"
        >
          {match}
        </mark>
        {after}
      </>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={effectiveTitle}
      description={`Source Citation ${resolvedPage ? `• Page ${resolvedPage}` : ''} ${material?.subject ? `• Subject: ${material.subject}` : ''}`}
    >
      <div className="space-y-4">
        {/* Top Header Card */}
        <div className="p-3.5 rounded-2xl bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-ink dark:text-white truncate">
                {effectiveTitle}
              </p>
              <p className="text-[11px] text-neutral-muted">
                {resolvedPage ? `Page ${resolvedPage}` : 'Extracted Text'} • {passage ? 'Exact passage highlighted below' : 'Full document'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {passage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPassage}
                className="h-8 text-xs px-2.5"
                title="Copy cited passage"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-mint mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}

            <Button
              variant="sky"
              size="sm"
              onClick={handleOpenInMaterials}
              className="h-8 text-xs font-bold px-3"
            >
              Open in Materials <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Scrollable Highlighted Text Container */}
        <div>
          <div className="flex items-center justify-between pb-1.5 text-xs text-neutral-muted">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Document Text with Source Highlight:
            </span>
            <span className="text-[10px] text-sky font-bold">
              ● Highlighted in Sky
            </span>
          </div>

          <div className="max-h-96 min-h-[180px] overflow-y-auto p-4 rounded-2xl bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border text-xs sm:text-sm text-ink dark:text-neutral-100 font-mono whitespace-pre-wrap leading-relaxed select-text">
            {isLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-4 bg-neutral-200 dark:bg-surface rounded animate-pulse w-3/4" />
                <div className="h-4 bg-neutral-200 dark:bg-surface rounded animate-pulse w-full" />
                <div className="h-4 bg-neutral-200 dark:bg-surface rounded animate-pulse w-5/6" />
              </div>
            ) : (
              renderHighlightedContent()
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-border dark:border-neutral-border">
          <span className="text-[11px] text-neutral-muted">
            Verified StudySpark Source Attribution
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
