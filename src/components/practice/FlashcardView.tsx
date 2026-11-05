import { ArrowLeft, Check, RotateCw, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface FlashcardViewProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface QueuedWord {
  word: WordItem
  repetitionCount: number
}

export function FlashcardView({ words, deckName, onBack }: FlashcardViewProps) {
  // Queue with repetition counter (Max 3 repeats per B5 fix)
  const [queue, setQueue] = useState<QueuedWord[]>(() =>
    words.map((w) => ({ word: w, repetitionCount: 0 }))
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)

  // Touch gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const currentItem = queue[currentIndex]
  const currentWord = currentItem?.word

  // Auto pronounce word on card appear
  useEffect(() => {
    if (currentWord && !isCompleted) {
      setIsFlipped(false)
      audioService.speak(currentWord.term)
    }
  }, [currentIndex, currentWord, isCompleted])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return
      if (e.code === 'Space') {
        e.preventDefault()
        handleFlip()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleAction('mastered')
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleAction('review')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFlipped, currentIndex, queue, isCompleted])

  const handleFlip = () => {
    audioService.playClick()
    setIsFlipped((prev) => !prev)
  }

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentWord) {
      audioService.speak(currentWord.term)
    }
  }

  const handleAction = (action: 'mastered' | 'review') => {
    if (!currentWord || isCompleted) return

    if (action === 'mastered') {
      audioService.playSuccessChime()
      storageService.updateWordStatus(currentWord.id, 'mastered')
      setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
    } else {
      audioService.playClick()
      storageService.updateWordStatus(currentWord.id, 'learning')
      setStats((prev) => ({ ...prev, review: prev.review + 1 }))

      // B5 Fix: Re-queue only if repetition count < 3
      if (currentItem.repetitionCount < 3) {
        setQueue((prev) => [
          ...prev,
          { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
        ])
      }
    }

    setDragOffset({ x: 0, y: 0 })
    setIsDragging(false)

    if (currentIndex + 1 >= queue.length) {
      setIsCompleted(true)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setIsFlipped(false)
    }
  }

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    // 24px dead-zone check for iOS Safari edge back swipe
    if (touch.clientX < 24) return

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    setDragOffset({ x: dx, y: dy })
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return
    const { x, y } = dragOffset
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    const threshold = 70

    // Check swipe up to flip
    if (y < -threshold && absY > absX * 1.2) {
      handleFlip()
    }
    // Check swipe right -> mastered
    else if (x > threshold && absX > absY * 1.2) {
      handleAction('mastered')
    }
    // Check swipe left -> review
    else if (x < -threshold && absX > absY * 1.2) {
      handleAction('review')
    }

    // Snap back
    setDragOffset({ x: 0, y: 0 })
    setIsDragging(false)
    touchStartRef.current = null
  }

  if (isCompleted) {
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'flashcard',
      deckName,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onRestart={() => {
          setQueue(words.map((w) => ({ word: w, repetitionCount: 0 })))
          setCurrentIndex(0)
          setStats({ mastered: 0, review: 0 })
          setIsCompleted(false)
        }}
        onBackToHome={onBack}
      />
    )
  }

  if (!currentWord) return null

  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100)

  return (
    <div className="flex flex-col h-full max-w-md mx-auto px-4 py-2 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Thẻ {currentIndex + 1} / {queue.length}
          </span>
          <div className="w-24 bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          onClick={handleFlip}
          className="p-2 -mr-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      {/* 3D Flashcard Container */}
      <div
        className="flex-1 flex items-center justify-center perspective-1000 my-auto py-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          onClick={handleFlip}
          style={{
            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotateX(${
              isFlipped ? 180 : 0
            }deg) rotateZ(${dragOffset.x * 0.05}deg)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className="relative w-full max-w-sm h-96 rounded-3xl cursor-pointer transform-style-3d shadow-xl border border-slate-200/80 dark:border-slate-800"
        >
          {/* FRONT CARD */}
          <div className="absolute inset-0 backface-hidden rounded-3xl bg-white dark:bg-slate-800 p-6 flex flex-col justify-between items-center text-center">
            <div className="w-full flex justify-between items-center">
              {currentWord.partOfSpeech && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  {currentWord.partOfSpeech}
                </span>
              )}
              <button
                onClick={handleSpeak}
                className="ml-auto w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <div className="my-auto">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words">
                {currentWord.term}
              </h2>
              {currentWord.ipa && (
                <p className="text-sm font-mono text-slate-400 dark:text-slate-500 mt-2">
                  {currentWord.ipa}
                </p>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
              <span>Vuốt LÊN hoặc chạm để xem nghĩa</span>
            </div>
          </div>

          {/* BACK CARD */}
          <div className="absolute inset-0 backface-hidden rotate-x-180 rounded-3xl bg-slate-900 dark:bg-slate-850 bg-slate-50 p-6 flex flex-col justify-between items-center text-center border-2 border-indigo-500/20">
            <div className="w-full flex justify-between items-center">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                Giải nghĩa
              </span>
              <button
                onClick={handleSpeak}
                className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <div className="my-auto space-y-4 px-2">
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug break-words">
                {currentWord.definition}
              </div>

              {currentWord.example && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs italic text-slate-600 dark:text-slate-300 leading-relaxed text-left border-l-2 border-indigo-500">
                  "{currentWord.example}"
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Vuốt Trái: Ôn lại | Vuốt Phải: Đã thuộc
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons (Alternative to swiping) */}
      <div className="grid grid-cols-2 gap-3 pt-4 pb-2">
        <button
          onClick={() => handleAction('review')}
          className="py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
          <span>Chưa nhớ (Ôn lại)</span>
        </button>

        <button
          onClick={() => handleAction('mastered')}
          className="py-3 px-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Check className="w-4 h-4" />
          <span>Đã thuộc</span>
        </button>
      </div>
    </div>
  )
}
