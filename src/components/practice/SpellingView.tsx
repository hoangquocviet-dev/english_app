import { ArrowLeft, Check, HelpCircle, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SpellingTile, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface SpellingViewProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface QueuedSpelling {
  word: WordItem
  repetitionCount: number
}

// Fisher-Yates shuffle
function shuffleTiles(tiles: SpellingTile[]): SpellingTile[] {
  const arr = [...tiles]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

export function SpellingView({ words, deckName, onBack }: SpellingViewProps) {
  const [queue, setQueue] = useState<QueuedSpelling[]>(() =>
    words.map((w) => ({ word: w, repetitionCount: 0 }))
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [poolTiles, setPoolTiles] = useState<SpellingTile[]>([])
  const [placedTiles, setPlacedTiles] = useState<Array<SpellingTile | null>>([])
  const [isSuccess, setIsSuccess] = useState(false)
  const [isWrong, setIsWrong] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)

  const currentItem = queue[currentIndex]
  const currentWord = currentItem?.word

  // Setup word tiles
  useEffect(() => {
    if (!currentWord) return

    // Clean target term: letters only for tile scramble, spaces/hyphens pre-placed
    const termChars = currentWord.term.split('')
    const newPool: SpellingTile[] = []
    const newPlaced: Array<SpellingTile | null> = []

    termChars.forEach((char, index) => {
      const isPunctuationOrSpace = /[\s\-'.]/.test(char)
      if (isPunctuationOrSpace) {
        // Pre-placed punctuation/space
        newPlaced.push({
          tileId: `prefilled-${index}`,
          letter: char,
          originalIndex: index,
        })
      } else {
        newPlaced.push(null)
        newPool.push({
          tileId: `tile-${index}-${char}`,
          letter: char,
          originalIndex: index,
        })
      }
    })

    // Shuffle pool tiles until not identical to original order
    let shuffled = shuffleTiles(newPool)
    if (newPool.length > 2 && shuffled.every((t, i) => t.originalIndex === newPool[i].originalIndex)) {
      shuffled = shuffleTiles(newPool)
    }

    setPoolTiles(shuffled)
    setPlacedTiles(newPlaced)
    setIsSuccess(false)
    setIsWrong(false)
  }, [currentIndex, currentWord])

  // Click on tile in pool -> Place into first empty slot
  const handleSelectPoolTile = (tile: SpellingTile) => {
    if (isSuccess) return
    audioService.playClick()
    setIsWrong(false)

    setPlacedTiles((prevPlaced) => {
      const firstEmptyIndex = prevPlaced.findIndex((slot) => slot === null)
      if (firstEmptyIndex === -1) return prevPlaced

      const nextPlaced = [...prevPlaced]
      nextPlaced[firstEmptyIndex] = tile

      // Remove from pool
      setPoolTiles((prevPool) => prevPool.filter((t) => t.tileId !== tile.tileId))

      // Check if all slots are now filled
      const isFullyFilled = nextPlaced.every((slot) => slot !== null)
      if (isFullyFilled) {
        checkAnswer(nextPlaced as SpellingTile[])
      }

      return nextPlaced
    })
  }

  // Click on placed tile -> Return it back to pool
  const handleRemovePlacedTile = (index: number) => {
    if (isSuccess) return
    const tile = placedTiles[index]
    if (!tile || tile.tileId.startsWith('prefilled-')) return

    audioService.playClick()
    setIsWrong(false)

    setPlacedTiles((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })

    setPoolTiles((prev) => [...prev, tile])
  }

  // Desktop physical keyboard listener for typing tiles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSuccess || !currentWord) return

      if (e.key === 'Backspace') {
        e.preventDefault()
        for (let i = placedTiles.length - 1; i >= 0; i--) {
          const tile = placedTiles[i]
          if (tile && !tile.tileId.startsWith('prefilled-')) {
            handleRemovePlacedTile(i)
            break
          }
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const pressedChar = e.key.toLowerCase()
        const matchingTile = poolTiles.find((t) => t.letter.toLowerCase() === pressedChar)
        if (matchingTile) {
          e.preventDefault()
          handleSelectPoolTile(matchingTile)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [poolTiles, placedTiles, isSuccess, currentWord])

  // Clear all placed tiles back to pool
  const handleClearAll = () => {
    if (!currentWord || isSuccess) return
    audioService.playClick()
    setIsWrong(false)

    const allReturnable: SpellingTile[] = []
    const termChars = currentWord.term.split('')
    const newPlaced: Array<SpellingTile | null> = []

    termChars.forEach((char, index) => {
      const isPunctuationOrSpace = /[\s\-'.]/.test(char)
      if (isPunctuationOrSpace) {
        newPlaced.push({
          tileId: `prefilled-${index}`,
          letter: char,
          originalIndex: index,
        })
      } else {
        newPlaced.push(null)
        allReturnable.push({
          tileId: `tile-${index}-${char}`,
          letter: char,
          originalIndex: index,
        })
      }
    })

    setPlacedTiles(newPlaced)
    setPoolTiles(shuffleTiles(allReturnable))
  }

  // Reveal correct answer if stuck
  const handleReveal = () => {
    if (!currentWord || isSuccess) return
    audioService.playClick()

    const termChars = currentWord.term.split('')
    const completedTiles: SpellingTile[] = termChars.map((char, index) => ({
      tileId: `revealed-${index}`,
      letter: char,
      originalIndex: index,
    }))

    setPoolTiles([])
    setPlacedTiles(completedTiles)
    setIsWrong(false)
    setIsSuccess(true)

    // Mark as review
    storageService.updateWordStatus(currentWord.id, 'learning')
    setStats((prev) => ({ ...prev, review: prev.review + 1 }))

    // Re-queue with repetition limit
    if (currentItem.repetitionCount < 3) {
      setQueue((prev) => [
        ...prev,
        { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
      ])
    }

    // Pronounce word
    audioService.speak(currentWord.term)

    setTimeout(() => {
      advanceNext()
    }, 1500)
  }

  // Check spelled word against target
  const checkAnswer = (slots: SpellingTile[]) => {
    if (!currentWord) return
    const spelledString = slots.map((s) => s.letter).join('')
    const isMatched = spelledString.toLowerCase().trim() === currentWord.term.toLowerCase().trim()

    if (isMatched) {
      // Correct!
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)
      setIsSuccess(true)
      setIsWrong(false)
      audioService.playSuccessChime()
      storageService.updateWordStatus(currentWord.id, 'mastered')
      setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))

      // Dual response: pronounce word loudly and clearly
      audioService.speak(currentWord.term)

      setTimeout(() => {
        advanceNext()
      }, 1200)
    } else {
      // Wrong!
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([80, 50, 80])
      setIsWrong(true)
      audioService.playErrorBuzz()
      storageService.updateWordStatus(currentWord.id, 'learning')
      setStats((prev) => ({ ...prev, review: prev.review + 1 }))

      // Re-queue failed word (B5 fix)
      if (currentItem.repetitionCount < 3) {
        setQueue((prev) => [
          ...prev,
          { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
        ])
      }
    }
  }

  const advanceNext = () => {
    if (currentIndex + 1 >= queue.length) {
      setIsCompleted(true)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setIsSuccess(false)
      setIsWrong(false)
    }
  }

  if (isCompleted) {
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'spelling',
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
    <div className="w-full flex flex-col h-full max-w-md mx-auto px-3.5 py-2 select-none">
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
            Từ {currentIndex + 1} / {queue.length}
          </span>
          <div className="w-24 bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearAll}
            title="Xếp lại từ đầu"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleReveal}
            title="Xem đáp án"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meaning & Audio Hint Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-4 relative">
        <button
          onClick={() => audioService.speak(currentWord.term)}
          className="absolute right-4 top-4 w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Volume2 className="w-4 h-4" />
        </button>

        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">
          Ghép chữ cái tiếng Anh
        </span>

        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug break-words px-6">
          {currentWord.definition}
        </h3>

        {currentWord.ipa && (
          <p className="text-sm font-sans tracking-wide text-indigo-600 dark:text-indigo-400 font-semibold mt-1.5">
            {currentWord.ipa}
          </p>
        )}
      </div>

      {/* Target Letter Slots (Placed Tiles) */}
      <div
        className={`min-h-16 flex flex-wrap items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all my-auto ${
          isSuccess
            ? 'bg-emerald-500/10 border-emerald-500 shadow-sm'
            : isWrong
            ? 'bg-rose-500/10 border-rose-500 animate-shake'
            : 'bg-slate-100/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
        }`}
      >
        {placedTiles.map((tile, index) => {
          const char = currentWord.term[index]
          if (char === ' ') {
            return <div key={index} className="w-3" />
          }

          if (char === '-') {
            return (
              <span
                key={index}
                className="px-1 text-xl font-bold text-slate-400 dark:text-slate-500 select-none flex items-center"
              >
                -
              </span>
            )
          }

          const isLongWord = currentWord.term.length > 8
          const sizeClasses = isLongWord
            ? 'w-8 h-11 text-base'
            : 'w-10 h-12 text-lg'

          if (!tile) {
            return (
              <div
                key={index}
                className={`${sizeClasses} rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center`}
              />
            )
          }

          const isPrefilled = tile.tileId.startsWith('prefilled-')

          return (
            <button
              key={index}
              disabled={isPrefilled || isSuccess}
              onClick={() => handleRemovePlacedTile(index)}
              className={`${sizeClasses} rounded-xl font-bold flex items-center justify-center shadow-xs transition-transform active:scale-90 ${
                isSuccess
                  ? 'bg-emerald-600 text-white'
                  : isWrong
                  ? 'bg-rose-600 text-white'
                  : isPrefilled
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600'
              }`}
            >
              {tile.letter}
            </button>
          )
        })}
      </div>

      {/* Status banner */}
      {isSuccess && (
        <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm py-2">
          <Check className="w-4 h-4" />
          <span>Chính xác! Chuẩn bị sang từ tiếp theo...</span>
        </div>
      )}

      {isWrong && (
        <div className="text-center text-rose-500 font-medium text-xs py-2">
          Chưa đúng, chạm vào chữ để gỡ ra hoặc bấm nút Hoàn tác bên trên.
        </div>
      )}

      {/* Scrambled Letter Tiles Pool */}
      <div className="pt-4 pb-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {poolTiles.map((tile) => (
            <button
              key={tile.tileId}
              disabled={isSuccess}
              onClick={() => handleSelectPoolTile(tile)}
              className="w-11 h-13 rounded-xl bg-white dark:bg-slate-800 border-b-3 border border-slate-300 dark:border-slate-700 font-bold text-lg text-slate-900 dark:text-slate-100 shadow-sm hover:border-indigo-500 active:translate-y-0.5 active:border-b transition-all flex items-center justify-center"
            >
              {tile.letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
