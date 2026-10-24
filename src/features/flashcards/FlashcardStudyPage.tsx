import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Shuffle,
  RotateCw,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Award,
  Filter,
  Trophy,
  Flame,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { queueOutboxAction } from '@/lib/offline/outbox'
import { toast } from 'sonner'
import type { FlashcardSet, Flashcard } from '@/types/database'
import { getOfflineDB } from '@/lib/offline/db'

export const FlashcardStudyPage: React.FC = () => {
  const { setId } = useParams<{ setId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [deck, setDeck] = useState<FlashcardSet | null>(null)
  const [allCards, setAllCards] = useState<Flashcard[]>([])
  const [displayCards, setDisplayCards] = useState<Flashcard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [reviewedCardIds, setReviewedCardIds] = useState<Set<string>>(new Set())
  const [filterDifficultOnly, setFilterDifficultOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeckCompleted, setIsDeckCompleted] = useState(false)
  const [roundNumber, setRoundNumber] = useState(1)
  const [sessionRatings, setSessionRatings] = useState<{ easy: number; medium: number; difficult: number }>({
    easy: 0,
    medium: 0,
    difficult: 0,
  })

  // Load deck & cards
  const loadDeck = useCallback(async () => {
    if (!setId || !user) return
    setIsLoading(true)

    try {
      let loadedSet: FlashcardSet | null = null
      let cards: Flashcard[] = []

      // 1. Try loading from Supabase
      try {
        const { data: setData, error: setErr } = await supabase
          .from('flashcard_sets')
          .select('*')
          .eq('id', setId)
          .eq('user_id', user.id)
          .single()

        if (!setErr && setData) {
          loadedSet = setData

          const { data: cardsData, error: cardsErr } = await supabase
            .from('flashcards')
            .select('*')
            .eq('set_id', setId)
            .order('position', { ascending: true })

          if (!cardsErr && cardsData) {
            cards = cardsData
          }
        }
      } catch (e) {
        console.warn('Supabase remote deck load failed, checking local IndexedDB:', e)
      }

      // 2. Check IndexedDB if remote returned nothing
      if (!loadedSet) {
        try {
          const db = await getOfflineDB()
          const localSet = await db.get('flashcard_sets', setId)
          if (localSet) {
            loadedSet = localSet
            cards = await db.getAllFromIndex('flashcards', 'by-set', setId)
          }
        } catch (e) {
          console.warn('IndexedDB load error:', e)
        }
      }

      if (!loadedSet) {
        throw new Error('Deck not found')
      }

      setDeck(loadedSet)
      setAllCards(cards)
      setDisplayCards(cards)

      // Set initially reviewed
      const alreadyReviewed = new Set<string>()
      cards.forEach(c => {
        if (c.times_reviewed > 0) alreadyReviewed.add(c.id)
      })
      setReviewedCardIds(alreadyReviewed)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load deck')
      navigate('/flashcards')
    } finally {
      setIsLoading(false)
    }
  }, [setId, user, navigate])

  useEffect(() => {
    loadDeck()
  }, [loadDeck])

  // Toggle Difficult Only Filter
  const toggleDifficultFilter = () => {
    const nextVal = !filterDifficultOnly
    setFilterDifficultOnly(nextVal)
    setCurrentIndex(0)
    setIsFlipped(false)

    if (nextVal) {
      const filtered = allCards.filter(c => c.difficulty_rating === 'difficult')
      if (filtered.length === 0) {
        toast.info('No cards are currently marked as "Difficult". Showing all cards.')
        setFilterDifficultOnly(false)
        setDisplayCards(allCards)
      } else {
        setDisplayCards(filtered)
        toast.info(`Filtered to ${filtered.length} difficult cards`)
      }
    } else {
      setDisplayCards(allCards)
    }
  }

  // Shuffle Cards
  const handleShuffle = () => {
    const shuffled = [...displayCards].sort(() => Math.random() - 0.5)
    setDisplayCards(shuffled)
    setCurrentIndex(0)
    setIsFlipped(false)
    toast.info('Deck shuffled')
  }

  // Rate Card
  const handleRateCard = async (rating: 'easy' | 'medium' | 'difficult') => {
    const card = displayCards[currentIndex]
    if (!card || !user) return

    // Track ratings in current round
    setSessionRatings(prev => ({
      ...prev,
      [rating]: prev[rating] + 1,
    }))

    // Update in-memory state
    const nextReviewed = new Set(reviewedCardIds)
    nextReviewed.add(card.id)
    setReviewedCardIds(nextReviewed)

    // Update card object rating
    card.difficulty_rating = rating
    card.times_reviewed += 1

    if (!navigator.onLine) {
      await queueOutboxAction('rate_flashcard', {
        cardId: card.id,
        setId: deck?.id,
        rating,
      })
    } else {
      try {
        await supabase.from('flashcard_reviews').insert({
          user_id: user.id,
          flashcard_id: card.id,
          set_id: deck!.id,
          rating,
        })

        await supabase
          .from('flashcards')
          .update({
            difficulty_rating: rating,
            times_reviewed: card.times_reviewed,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq('id', card.id)
      } catch (e) {
        console.error('Rating error:', e)
      }
    }

    // Advance to next card or complete round
    if (currentIndex < displayCards.length - 1) {
      setIsFlipped(false)
      setCurrentIndex(prev => prev + 1)
    } else {
      // Reached the end of all cards in this round
      setIsFlipped(false)
      setIsDeckCompleted(true)

      // Award 15 points for deck review
      if (navigator.onLine) {
        try {
          await supabase.rpc('award_points_and_badges', {
            p_user_id: user.id,
            p_event_type: 'flashcard_set_reviewed',
            p_source_id: deck!.id,
            p_points: 15,
          })
        } catch (ptsErr) {
          console.warn('Could not award points:', ptsErr)
        }
      }

      confetti({ particleCount: 90, spread: 70 })
      toast.success(`Congratulations! You completed Round ${roundNumber} (+15 pts)!`)
    }
  }

  // Start Another Round
  const handleStartAnotherRound = (difficultOnly = false) => {
    setIsFlipped(false)
    setIsDeckCompleted(false)
    setRoundNumber(prev => prev + 1)
    setSessionRatings({ easy: 0, medium: 0, difficult: 0 })

    if (difficultOnly) {
      const diffCards = allCards.filter(c => c.difficulty_rating === 'difficult')
      if (diffCards.length > 0) {
        setDisplayCards(diffCards)
        setFilterDifficultOnly(true)
        setCurrentIndex(0)
        toast.info(`Starting review of ${diffCards.length} difficult cards!`)
        return
      }
    }

    // Default: Reset and shuffle all cards for another complete round
    const shuffled = [...allCards].sort(() => Math.random() - 0.5)
    setDisplayCards(shuffled)
    setFilterDifficultOnly(false)
    setCurrentIndex(0)
    toast.success(`Starting Round ${roundNumber + 1}! Good luck!`)
  }

  // Keyboard navigation: Space = Flip, Left = Prev, Right = Next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') {
        e.preventDefault()
        setIsFlipped(prev => !prev)
      } else if (e.code === 'ArrowRight') {
        if (currentIndex < displayCards.length - 1) {
          setIsFlipped(false)
          setCurrentIndex(prev => prev + 1)
        }
      } else if (e.code === 'ArrowLeft') {
        if (currentIndex > 0) {
          setIsFlipped(false)
          setCurrentIndex(prev => prev - 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, displayCards.length])

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    )
  }

  const currentCard = displayCards[currentIndex]
  const totalCards = displayCards.length
  const hasDifficultCards = allCards.some(c => c.difficulty_rating === 'difficult') || sessionRatings.difficult > 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/flashcards')}
          className="inline-flex items-center text-xs font-semibold text-neutral-muted hover:text-ink dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> All Decks
        </button>

        {!isDeckCompleted && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleDifficultFilter}
              className={`text-xs ${filterDifficultOnly ? 'bg-coral text-ink-navy border-coral' : ''}`}
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              {filterDifficultOnly ? 'Difficult Only (On)' : 'Difficult Only'}
            </Button>

            <Button variant="outline" size="sm" onClick={handleShuffle} title="Shuffle deck">
              <Shuffle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* DECK COMPLETED CELEBRATION VIEW */}
      {isDeckCompleted ? (
        <Card className="p-6 sm:p-8 text-center space-y-6 shadow-soft border-neutral-border dark:border-neutral-800 bg-white dark:bg-surface animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="h-20 w-20 rounded-3xl bg-sun text-ink-navy flex items-center justify-center shadow-soft animate-bounce">
              <Trophy className="h-10 w-10 text-ink-navy" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-coral-100 dark:bg-coral-950/60 text-coral-700 dark:text-coral-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" /> Round {roundNumber} Completed!
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink dark:text-white tracking-tight">
              Deck Finished! Outstanding Recall!
            </h2>
            <p className="text-xs sm:text-sm text-neutral-muted max-w-md mx-auto">
              You reviewed all {displayCards.length} cards in <strong>{deck?.title || 'this study deck'}</strong>. Spaced repetition solidifies key concepts for your exams.
            </p>
          </div>

          {/* Session Performance Breakdown Grid (Easy = mint, Medium = sun, Difficult = coral) */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-neutral-bg dark:bg-neutral-900 border border-neutral-border dark:border-neutral-800">
            {/* Easy / Mastered (Mint) */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-mint-50 dark:bg-mint-950/40 border border-mint-200 dark:border-mint-800">
              <span className="text-2xl font-black text-mint-700 dark:text-mint">
                {sessionRatings.easy}
              </span>
              <span className="text-[11px] font-bold text-mint-700 dark:text-mint uppercase mt-0.5">
                Easy
              </span>
              <span className="text-[9px] text-neutral-muted">Mastered</span>
            </div>

            {/* Medium / Understood (Sun) */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-sun-50 dark:bg-sun-950/40 border border-sun-200 dark:border-sun-800">
              <span className="text-2xl font-black text-sun-700 dark:text-sun">
                {sessionRatings.medium}
              </span>
              <span className="text-[11px] font-bold text-sun-700 dark:text-sun uppercase mt-0.5">
                Medium
              </span>
              <span className="text-[9px] text-neutral-muted">Understood</span>
            </div>

            {/* Difficult / Review Soon (Coral) */}
            <div className="flex flex-col items-center p-3 rounded-xl bg-coral-50 dark:bg-coral-950/40 border border-coral-200 dark:border-coral-800">
              <span className="text-2xl font-black text-coral-700 dark:text-coral">
                {sessionRatings.difficult}
              </span>
              <span className="text-[11px] font-bold text-coral-700 dark:text-coral uppercase mt-0.5">
                Difficult
              </span>
              <span className="text-[9px] text-neutral-muted">Review soon</span>
            </div>
          </div>

          {/* Points Bonus Badge (Sun) */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-sun-100 dark:bg-sun-950/40 text-sun-800 dark:text-sun-300 border border-sun-200 dark:border-sun-800 text-xs font-bold">
            <Award className="h-4 w-4 text-sun-600 dark:text-sun-400" />
            <span>+15 Study Points Awarded for Deck Completion!</span>
          </div>

          {/* Action Buttons: Continue Another Round, Review Difficult, or Exit */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={() => handleStartAnotherRound(false)}
              variant="coral"
              size="lg"
              className="flex-1 font-bold text-xs sm:text-sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Continue Another Round
            </Button>

            {hasDifficultCards && (
              <Button
                onClick={() => handleStartAnotherRound(true)}
                variant="outline"
                size="lg"
                className="flex-1 border-coral text-coral hover:bg-coral-50 dark:hover:bg-coral-950/40 font-bold text-xs sm:text-sm"
              >
                <Filter className="h-4 w-4 mr-2" /> Review Difficult Only
              </Button>
            )}

            <Button
              onClick={() => navigate('/flashcards')}
              variant="outline"
              size="lg"
              className="sm:w-auto font-semibold text-xs sm:text-sm"
            >
              All Decks
            </Button>
          </div>
        </Card>
      ) : (
        /* ACTIVE FLASHCARD STUDY INTERFACE */
        <>
          {/* Progress & Counters */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-neutral-muted font-medium">
              <span>
                Round {roundNumber} • Card {currentIndex + 1} of {totalCards}
              </span>
              <span>Reviewed {reviewedCardIds.size} of {allCards.length}</span>
            </div>
            <Progress value={currentIndex + 1} max={totalCards} indicatorClassName="bg-coral" />
          </div>

          {/* 3D Flip Flashcard */}
          {currentCard ? (
            <div className="perspective-1000 w-full">
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className={`relative w-full min-h-[340px] rounded-3xl cursor-pointer transition-transform duration-500 transform-style-preserve-3d shadow-xl select-none ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
              >
                {/* FRONT OF CARD (#FF6B57 to #EC4899 with navy #1B2559 text) */}
                <div className="absolute inset-0 backface-hidden rounded-3xl bg-gradient-flashcard text-ink-navy p-8 flex flex-col justify-between shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider bg-white/40 text-ink-navy px-3 py-1 rounded-full backdrop-blur-md">
                      {currentCard.topic || 'Concept Prompt'}
                    </span>
                    <span className="text-xs text-ink-navy/80 font-medium flex items-center gap-1">
                      <RotateCw className="h-3.5 w-3.5" /> Tap or Space to Flip
                    </span>
                  </div>

                  <div className="my-auto py-6 text-center">
                    <h2 className="text-xl sm:text-2xl font-extrabold leading-snug text-ink-navy">
                      {currentCard.front}
                    </h2>
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-navy/80 font-medium">
                    <span>Front</span>
                    {currentCard.difficulty_rating && (
                      <span className="capitalize">Rating: {currentCard.difficulty_rating}</span>
                    )}
                  </div>
                </div>

                {/* BACK OF CARD (Surface White / Dark elevated) */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-white dark:bg-surface border-2 border-coral-200 dark:border-coral-800 text-ink dark:text-white p-8 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-coral">
                      Explanation & Answer
                    </span>
                    <span className="text-xs text-neutral-muted flex items-center gap-1">
                      <RotateCw className="h-3.5 w-3.5" /> Tap to Flip Back
                    </span>
                  </div>

                  <div className="my-auto py-6 text-center">
                    <p className="text-base sm:text-lg font-medium leading-relaxed text-ink dark:text-neutral-100">
                      {currentCard.back}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-muted">
                    <span>Back</span>
                    <span>Reviewed {currentCard.times_reviewed} times</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Card className="text-center py-12">
              <p className="text-sm text-neutral-muted">No cards to display.</p>
            </Card>
          )}

          {/* Difficulty Rating Buttons: Difficult (Coral) / Medium (Sun) / Easy (Mint) */}
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold text-neutral-muted uppercase tracking-wider">
              Rate Your Recall
            </p>
            <div className="grid grid-cols-3 gap-3">
              {/* Difficult (Coral #FF6B57) */}
              <button
                onClick={() => handleRateCard('difficult')}
                className="py-3 px-4 rounded-2xl bg-coral-100 hover:bg-coral-200 dark:bg-coral-950/60 dark:hover:bg-coral-900 text-coral-800 dark:text-coral font-bold text-xs sm:text-sm border border-coral-300 dark:border-coral-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
              >
                <span>Difficult</span>
                <span className="text-[10px] font-normal opacity-80">Repeat soon</span>
              </button>

              {/* Medium (Sun #FFB400) */}
              <button
                onClick={() => handleRateCard('medium')}
                className="py-3 px-4 rounded-2xl bg-sun-100 hover:bg-sun-200 dark:bg-sun-950/60 dark:hover:bg-sun-900 text-sun-800 dark:text-sun font-bold text-xs sm:text-sm border border-sun-300 dark:border-sun-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
              >
                <span>Medium</span>
                <span className="text-[10px] font-normal opacity-80">Understood</span>
              </button>

              {/* Easy (Mint #14C38E) */}
              <button
                onClick={() => handleRateCard('easy')}
                className="py-3 px-4 rounded-2xl bg-mint-100 hover:bg-mint-200 dark:bg-mint-950/60 dark:hover:bg-mint-900 text-mint-800 dark:text-mint font-bold text-xs sm:text-sm border border-mint-300 dark:border-mint-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
              >
                <span>Easy</span>
                <span className="text-[10px] font-normal opacity-80">Mastered</span>
              </button>
            </div>
          </div>

          {/* Prev / Next Bottom Controls */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => {
                setIsFlipped(false)
                setCurrentIndex(prev => prev - 1)
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
            </Button>

            <span className="text-xs text-neutral-muted hidden sm:inline">
              Use ← and → arrow keys to navigate
            </span>

            {currentIndex < totalCards - 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsFlipped(false)
                  setCurrentIndex(prev => prev + 1)
                }}
              >
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button
                variant="coral"
                size="sm"
                onClick={() => {
                  setIsFlipped(false)
                  setIsDeckCompleted(true)
                  confetti({ particleCount: 90, spread: 70 })
                  toast.success(`Round ${roundNumber} completed!`)
                }}
                className="font-bold text-xs"
              >
                Finish Round <CheckCircle2 className="h-4 w-4 ml-1.5" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
