import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Layers,
  Sparkles,
  Plus,
  Play,
  Trash2,
  Edit2,
  FileText,
  AlertCircle,
  BookOpen,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { FlashcardSet, Material } from '@/types/database'
import { generateFlashcardsLocally } from '@/lib/aiFallback'
import { getOfflineDB } from '@/lib/offline/db'

export const FlashcardSetsPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselectedMaterialId = searchParams.get('materialId')

  const [sets, setSets] = useState<FlashcardSet[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Creation modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(preselectedMaterialId || '')
  const [rawText, setRawText] = useState('')
  const [deckTitle, setDeckTitle] = useState('')
  const [cardCount, setCardCount] = useState<number>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Rename modal
  const [setToRename, setSetToRename] = useState<FlashcardSet | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)

  // Delete modal
  const [setToDelete, setSetToDelete] = useState<FlashcardSet | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      let remoteSets: FlashcardSet[] = []
      try {
        const { data: setsData, error: setsErr } = await supabase
          .from('flashcard_sets')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (!setsErr && setsData) {
          remoteSets = setsData
        }
      } catch (e) {
        console.warn('Remote flashcard sets not loaded:', e)
      }

      let localSets: FlashcardSet[] = []
      try {
        const db = await getOfflineDB()
        localSets = await db.getAll('flashcard_sets')
      } catch (e) {
        console.warn('IndexedDB flashcard sets load error:', e)
      }

      const allSetsMap = new Map<string, FlashcardSet>()
      remoteSets.forEach(s => allSetsMap.set(s.id, s))
      localSets.forEach(s => {
        if (!allSetsMap.has(s.id)) allSetsMap.set(s.id, s)
      })

      setSets(Array.from(allSetsMap.values()))

      try {
        const { data: matData } = await supabase
          .from('materials')
          .select('id, title, subject, status')
          .eq('user_id', user.id)
          .eq('status', 'ready')

        setMaterials(matData as Material[] || [])
      } catch (e) {
        // Materials table check
      }
    } catch (err) {
      console.warn('Notice loading flashcard sets:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleGenerateDeck = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenError(null)

    if (!selectedMaterialId && (!rawText || rawText.trim().length < 40)) {
      setGenError('Please select a material or paste at least 40 characters of study notes.')
      return
    }

    if (!navigator.onLine) {
      setGenError('AI Flashcard generation requires an active internet connection.')
      return
    }

    setIsGenerating(true)

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not authenticated')

      let finalSetId: string | null = null

      // 1. Try Supabase Edge Function first
      try {
        const { data, error } = await supabase.functions.invoke('generate-flashcards', {
          body: {
            material_id: selectedMaterialId || undefined,
            raw_text: !selectedMaterialId ? rawText.trim() : undefined,
            title: deckTitle.trim() || undefined,
            count: Number(cardCount),
          },
        })

        if (!error && data?.set_id) {
          finalSetId = data.set_id
        } else if (error) {
          console.warn('Edge function returned error, attempting browser AI generator:', error.message)
        }
      } catch (edgeErr: any) {
        console.warn('Edge function unavailable, falling back to browser generator:', edgeErr?.message)
      }

      // 2. Fallback to smart in-browser generator if Edge Function is not deployed
      if (!finalSetId) {
        const localResult = await generateFlashcardsLocally({
          userId: session.user.id,
          materialId: selectedMaterialId || undefined,
          rawText: !selectedMaterialId ? rawText.trim() : undefined,
          title: deckTitle.trim() || undefined,
          count: Number(cardCount),
        })
        finalSetId = localResult.set_id
      }

      toast.success('Flashcard deck created successfully!')
      setIsCreateOpen(false)
      navigate(`/flashcards/${finalSetId}`)
    } catch (err: any) {
      console.error('Deck generation error:', err)
      setGenError(err.message || 'Failed to generate flashcards.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRename = async () => {
    if (!setToRename || !newTitle.trim()) return
    setIsRenaming(true)

    try {
      const { error } = await supabase
        .from('flashcard_sets')
        .update({ title: newTitle.trim() })
        .eq('id', setToRename.id)

      if (error) throw error
      toast.success('Deck renamed')
      setSetToRename(null)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename deck')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async () => {
    if (!setToDelete) return
    setIsDeleting(true)

    try {
      const { error } = await supabase.from('flashcard_sets').delete().eq('id', setToDelete.id)
      if (error) throw error
      toast.success('Deck deleted')
      setSetToDelete(null)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete deck')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Flashcard Decks
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Active recall decks with 3D flip animation and spaced repetition difficulty ratings.
          </p>
        </div>
        <Button variant="coral" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Create Flashcard Deck
        </Button>
      </div>

      {/* Decks Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : sets.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <Layers className="h-12 w-12 text-coral mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-ink dark:text-white">No flashcard decks yet</h3>
          <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
            Extract active recall concept cards from your lecture materials or notes.
          </p>
          <Button variant="coral" size="sm" className="mt-5" onClick={() => setIsCreateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Generate First Deck
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sets.map(deck => (
            <Card
              key={deck.id}
              className="p-5 flex flex-col justify-between border-t-2 border-t-coral shadow-soft hover:shadow-md transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="coral" className="font-bold">
                    {deck.card_count} Cards
                  </Badge>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setSetToRename(deck)
                        setNewTitle(deck.title)
                      }}
                      className="p-1.5 rounded-lg text-sun-700 dark:text-sun-400 bg-sun/10 hover:bg-sun hover:text-ink-navy border border-sun/30 font-bold transition-all"
                      title="Rename"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setSetToDelete(deck)}
                      className="p-1.5 rounded-lg text-coral bg-coral/10 hover:bg-coral hover:text-white border border-coral/30 font-bold transition-all"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-ink dark:text-white mt-3 line-clamp-2">
                  {deck.title}
                </h3>
                <p className="text-xs text-neutral-muted mt-1">
                  Subject: {deck.subject || 'General'}
                </p>
                <p className="text-[11px] text-neutral-muted mt-0.5">
                  Created {formatDate(deck.created_at)}
                </p>
              </div>

              <div className="pt-5 mt-4 border-t border-neutral-border dark:border-neutral-800">
                <Button
                  variant="coral"
                  size="sm"
                  className="w-full font-bold shadow-sm text-ink-navy"
                  onClick={() => navigate(`/flashcards/${deck.id}`)}
                >
                  <Play className="h-3.5 w-3.5 mr-1 text-ink-navy" /> Study Deck
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      <Dialog
        open={isCreateOpen}
        onClose={() => !isGenerating && setIsCreateOpen(false)}
        title="Generate Flashcard Deck"
        description="Claude Sonnet extracts key definitions, questions, and concepts."
      >
        <form onSubmit={handleGenerateDeck} className="space-y-4">
          {genError && (
            <div className="p-3 text-xs text-destructive bg-destructive-50 rounded-xl border border-destructive/20 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{genError}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold block mb-1">Select Uploaded Material</label>
            <select
              value={selectedMaterialId}
              onChange={e => {
                setSelectedMaterialId(e.target.value)
                if (e.target.value) setRawText('')
              }}
              className="w-full rounded-xl border border-neutral-border dark:border-ink-800 bg-white dark:bg-ink-900 p-2.5 text-sm text-ink dark:text-white"
            >
              <option value="">— Or paste notes below —</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.source_type === 'youtube'
                    ? `📺 [YouTube] ${m.title}`
                    : m.source_type === 'audio'
                    ? `🎙️ [Audio] ${m.title}`
                    : m.source_type === 'video'
                    ? `🎥 [Video] ${m.title}`
                    : `📄 ${m.title}`}{' '}
                  ({m.subject || 'General'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Or Paste Notes</label>
            <textarea
              rows={3}
              placeholder="Paste study notes..."
              value={rawText}
              onChange={e => {
                setRawText(e.target.value)
                if (e.target.value) setSelectedMaterialId('')
              }}
              className="w-full rounded-xl border border-neutral-border dark:border-ink-800 bg-white dark:bg-ink-900 p-2.5 text-xs text-ink dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Deck Title</label>
              <Input
                placeholder="e.g. Psychology Terms"
                value={deckTitle}
                onChange={e => setDeckTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Number of Cards</label>
              <select
                value={cardCount}
                onChange={e => setCardCount(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-border dark:border-ink-800 bg-white dark:bg-ink-900 p-2.5 text-sm text-ink dark:text-white"
              >
                {[5, 10, 15, 20, 30].map(n => (
                  <option key={n} value={n}>
                    {n} Cards
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="coral"
              size="sm"
              type="submit"
              disabled={isGenerating}
              isLoading={isGenerating}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {isGenerating ? 'Generating Cards...' : 'Generate Deck'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={Boolean(setToRename)}
        onClose={() => setSetToRename(null)}
        title="Rename Deck"
        confirmText="Save Name"
        onConfirm={handleRename}
        isConfirmLoading={isRenaming}
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold block">Title</label>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        </div>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={Boolean(setToDelete)}
        onClose={() => setSetToDelete(null)}
        title="Delete Deck"
        description={`Are you sure you want to delete "${setToDelete?.title}"? All cards in this deck will be deleted.`}
        confirmText="Delete Deck"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        isConfirmLoading={isDeleting}
      />
    </div>
  )
}
