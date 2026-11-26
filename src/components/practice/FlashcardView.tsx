import { ArrowLeft, Check, RotateCw, Undo2, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface FlashcardViewProps {
  words: WordItem[]
  deckId: string
  deckName: string
  onBack: () => void
}

interface QueuedWord {
  word: WordItem
  repetitionCount: number
}

interface HistoryEntry {
  word: WordItem
  prevStatus: WordItem['status']
  action: 'mastered' | 'review'
  wasRequeued: boolean
}

export function FlashcardView({ words, deckId, deckName, onBack }: FlashcardViewProps) {
  const [queue, setQueue] = useState<QueuedWord[]>(() =>
    words.map((w) => ({ word: w, repetitionCount: 0 }))
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isCompleted, setIsCompleted] = useState(false)

  // Touch gesture state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const ignoreClickUntilRef = useRef(0)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const currentItem = queue[currentIndex]
  const currentWord = currentItem?.word

  useEffect(() => {
    return () => {
      audioService.stopSpeech()
    }
  }, [])

  // Auto pronounce word on card appear (respects global mute)
  useEffect(() => {
    if (currentWord && !isCompleted) {
      audioService.speakAuto(currentWord.term)
    }
  }, [currentIndex, currentWord, isCompleted])

  const handleFlip = useCallback(() => {
    audioService.playClick()
    setIsFlipped((prev) => !prev)
  }, [])

  const handleAction = useCallback(
    (action: 'mastered' | 'review') => {
      if (!currentWord || !currentItem || isCompleted) return

      const prevStatus = currentWord.status
      let wasRequeued = false

      if (action === 'mastered') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(25)
          } catch {}
        }
        audioService.playSuccessChime()
        storageService.updateWordStatus(currentWord.id, 'mastered')
        setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {}
        }
        audioService.playClick()
        storageService.updateWordStatus(currentWord.id, 'learning')
        setStats((prev) => ({ ...prev, review: prev.review + 1 }))

        // Re-queue only if repetition count < 3
        if (currentItem.repetitionCount < 3) {
          wasRequeued = true
          setQueue((prev) => [
            ...prev,
            { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
          ])
        }
      }

      setHistory((prev) => [
        ...prev,
        { word: currentWord, prevStatus, action, wasRequeued },
      ])

      setDragOffset({ x: 0, y: 0 })
      setIsDragging(false)

      const nextLength = queue.length + (wasRequeued ? 1 : 0)
      if (currentIndex + 1 >= nextLength) {
        setIsCompleted(true)
      } else {
        setCurrentIndex((prev) => prev + 1)
        setIsFlipped(false)
      }
    },
    [currentWord, currentItem, isCompleted, queue.length, currentIndex]
  )

  const handleUndo = useCallback(() => {
    if (history.length === 0 || currentIndex === 0 || isCompleted) return

    const last = history[history.length - 1]
    audioService.playClick()

    // Restore previous word status without incrementing daily count
    storageService.updateWordStatus(last.word.id, last.prevStatus, false)

    setStats((prev) => ({
      mastered: last.action === 'mastered' ? Math.max(0, prev.mastered - 1) : prev.mastered,
      review: last.action === 'review' ? Math.max(0, prev.review - 1) : prev.review,
    }))

    if (last.wasRequeued) {
      setQueue((prev) => prev.slice(0, -1))
    }

    setHistory((prev) => prev.slice(0, -1))
    setCurrentIndex((prev) => Math.max(0, prev - 1))
    setIsFlipped(false)
  }, [history, currentIndex, isCompleted])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        handleFlip()
      } else if (e.code === 'ArrowRight' || e.key === '2') {
        e.preventDefault()
        handleAction('mastered')
      } else if (e.code === 'ArrowLeft' || e.key === '1') {
        e.preventDefault()
        handleAction('review')
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCompleted, handleFlip, handleAction, handleUndo, onBack])

  const handleSpeak = (e: React.MouseEvent, rate: number = 0.9) => {
    e.stopPropagation()
    if (currentWord) {
      audioService.speak(currentWord.term, rate)
    }
  }

  const handleSpeakExample = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentWord?.example) {
      audioService.speak(currentWord.example, 0.9)
    }
  }

  // Touch & Mouse Drag Handlers
  const startDrag = (clientX: number, clientY: number, isTouch: boolean) => {
    if (isTouch && clientX < 24) return
    touchStartRef.current = { x: clientX, y: clientY }
    setIsDragging(true)
  }

  const moveDrag = (clientX: number, clientY: number) => {
    if (!touchStartRef.current) return
    setDragOffset({
      x: clientX - touchStartRef.current.x,
      y: clientY - touchStartRef.current.y,
    })
  }

  const endDrag = () => {
    if (!touchStartRef.current) return
    const { x, y } = dragOffset
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    const threshold = 70

    if (absX > 12 || absY > 12) {
      // Suppress synthetic click right after swipe/drag so card never double-flips
      ignoreClickUntilRef.current = performance.now() + 360
    }

    // Swipe up or down to flip
    if (absY > threshold && absY > absX * 1.2) {
      handleFlip()
    }
    // Swipe right -> mastered
    else if (x > threshold && absX > absY * 1.2) {
      handleAction('mastered')
    }
    // Swipe left -> review
    else if (x < -threshold && absX > absY * 1.2) {
      handleAction('review')
    }

    setDragOffset({ x: 0, y: 0 })
    setIsDragging(false)
    touchStartRef.current = null
  }

  const handleCardClick = () => {
    if (performance.now() < ignoreClickUntilRef.current) return
    handleFlip()
  }

  const startSessionWithWords = (targetWords: WordItem[]) => {
    setQueue(targetWords.map((w) => ({ word: w, repetitionCount: 0 })))
    setCurrentIndex(0)
    setStats({ mastered: 0, review: 0 })
    setHistory([])
    setIsFlipped(false)
    setIsCompleted(false)
  }

  if (isCompleted) {
    const remainingList = storageService.getRemainingWordsForSession(deckId, words)
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'flashcard',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => startSessionWithWords(rem)}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  startSessionWithWords(storageService.getWords(deckId))
                })
              }
        }
        onBackToHome={onBack}
      />
    )
  }

  if (!currentWord) return null

  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100)
  const rightSwipeOpacity = Math.min(1, Math.max(0, (dragOffset.x - 20) / 60))
  const leftSwipeOpacity = Math.min(1, Math.max(0, (-dragOffset.x - 20) / 60))

  return (
    <div className="w-full flex flex-col my-auto max-w-md mx-auto px-3.5 py-2 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          title="Quay lại"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Thẻ {currentIndex + 1} / {queue.length}
          </span>
          <div className="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 -mr-2">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Hoàn tác thẻ trước"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleFlip}
            title="Lật thẻ"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3D Flashcard Container */}
      <div
        className="flex-1 flex items-center justify-center perspective-1000 my-auto py-3 relative"
        onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY, true)}
        onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endDrag}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button')) return
          startDrag(e.clientX, e.clientY, false)
        }}
        onMouseMove={(e) => {
          if (e.buttons === 1) moveDrag(e.clientX, e.clientY)
        }}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          if (isDragging) endDrag()
        }}
        data-no-pull="true"
      >
        {/* Dynamic Swipe Stamps */}
        {rightSwipeOpacity > 0.05 && (
          <div
            style={{ opacity: rightSwipeOpacity }}
            className="absolute top-6 left-6 z-20 pointer-events-none px-3 py-1.5 rounded-xl border-2 border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-sm uppercase tracking-wider -rotate-12 shadow-sm"
          >
            Đã thuộc
          </div>
        )}
        {leftSwipeOpacity > 0.05 && (
          <div
            style={{ opacity: leftSwipeOpacity }}
            className="absolute top-6 right-6 z-20 pointer-events-none px-3 py-1.5 rounded-xl border-2 border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold text-sm uppercase tracking-wider rotate-12 shadow-sm"
          >
            Ôn lại
          </div>
        )}

        <div
          onClick={handleCardClick}
          data-no-pull="true"
          data-testid="flashcard-3d"
          style={{
            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotateX(${
              isFlipped ? 180 : 0
            }deg) rotateZ(${dragOffset.x * 0.05}deg)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
          }}
          className="relative w-full max-w-sm h-80 sm:h-96 rounded-3xl cursor-pointer shadow-xl border border-slate-200/80 dark:border-slate-800"
        >
          {/* FRONT CARD */}
          <div
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'rotateX(0deg)',
              WebkitTransform: 'rotateX(0deg)',
            }}
            className="absolute inset-0 rounded-3xl bg-white dark:bg-slate-800 p-6 flex flex-col justify-between items-center text-center shadow-xs select-none"
          >
            <div className="w-full flex justify-between items-center gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {currentWord.partOfSpeech && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    {currentWord.partOfSpeech}
                  </span>
                )}
                {currentWord.status === 'mastered' && currentWord.srsLevel ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                    SRS Lv.{currentWord.srsLevel}
                  </span>
                ) : currentWord.status === 'learning' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    Đang ôn
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => handleSpeak(e, 0.6)}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Nghe chậm (0.6x)"
                >
                  0.6x
                </button>
                <button
                  onClick={(e) => handleSpeak(e, 0.9)}
                  className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Phát âm chuẩn"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="my-auto px-2">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words">
                {currentWord.term}
              </h2>
              {currentWord.ipa && (
                <p className="text-sm font-sans font-medium tracking-wide text-slate-400 dark:text-slate-500 mt-2">
                  {currentWord.ipa}
                </p>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
              <span>Vuốt LÊN / XUỐNG hoặc chạm để xem nghĩa</span>
            </div>
          </div>

          {/* BACK CARD */}
          <div
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'rotateX(180deg)',
              WebkitTransform: 'rotateX(180deg)',
            }}
            className="absolute inset-0 rounded-3xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-6 flex flex-col justify-between items-center text-center border-2 border-indigo-500/30 shadow-xs select-none"
          >
            <div className="w-full flex justify-between items-center">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Giải nghĩa
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => handleSpeak(e, 0.6)}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Nghe chậm (0.6x)"
                >
                  0.6x
                </button>
                <button
                  onClick={(e) => handleSpeak(e, 0.9)}
                  className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Phát âm chuẩn"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="my-auto space-y-3 px-1 w-full max-h-64 overflow-y-auto">
              <div
                className={`font-bold text-slate-900 dark:text-slate-100 leading-snug break-words ${
                  currentWord.definition.length > 125 ? 'text-base sm:text-lg' : 'text-xl'
                }`}
              >
                {currentWord.definition}
              </div>

              {currentWord.example && (
                <button
                  type="button"
                  onClick={handleSpeakExample}
                  title="Chạm để nghe đọc cả câu ví dụ"
                  className="w-full p-3 rounded-xl bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-xs italic text-slate-700 dark:text-slate-200 leading-relaxed text-left border-l-4 border-indigo-500 flex items-start justify-between gap-2 transition-colors"
                >
                  <span>"{currentWord.example}"</span>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Vuốt Trái: Ôn lại | Vuốt Phải: Đã thuộc
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 pt-3 pb-2">
        <button
          onClick={() => handleAction('review')}
          className="py-3 px-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <X className="w-4 h-4 shrink-0" />
          <span>Chưa nhớ</span>
        </button>

        <button
          onClick={() => handleAction('mastered')}
          className="py-3 px-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>Đã thuộc</span>
        </button>
      </div>
    </div>
  )
}
