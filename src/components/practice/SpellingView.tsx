import { ArrowLeft, Check, HelpCircle, Lightbulb, RotateCcw, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpellingTile, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface SpellingViewProps {
  words: WordItem[]
  deckId: string
  deckName: string
  onBack: () => void
}

interface QueuedSpelling {
  word: WordItem
  repetitionCount: number
}

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

function createTilesForWord(term: string): {
  pool: SpellingTile[]
  placed: Array<SpellingTile | null>
} {
  const termChars = term.split('')
  const newPool: SpellingTile[] = []
  const newPlaced: Array<SpellingTile | null> = []

  termChars.forEach((char, index) => {
    const isSymbolOrSpace = /[^a-zA-Z0-9]/.test(char)
    if (isSymbolOrSpace) {
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

  let shuffled = shuffleTiles(newPool)
  if (
    newPool.length > 2 &&
    shuffled.every((t, i) => t.originalIndex === newPool[i].originalIndex)
  ) {
    shuffled = shuffleTiles(newPool)
  }

  return { pool: shuffled, placed: newPlaced }
}

export function SpellingView({ words, deckId, deckName, onBack }: SpellingViewProps) {
  const initialQueue = words.map((w) => ({ word: w, repetitionCount: 0 }))
  const initialTiles = words[0] ? createTilesForWord(words[0].term) : { pool: [], placed: [] }

  const [queue, setQueue] = useState<QueuedSpelling[]>(() => initialQueue)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [poolTiles, setPoolTiles] = useState<SpellingTile[]>(() => initialTiles.pool)
  const [placedTiles, setPlacedTiles] = useState<Array<SpellingTile | null>>(
    () => initialTiles.placed
  )
  const [isSuccess, setIsSuccess] = useState(false)
  const [isWrong, setIsWrong] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)

  const queueRef = useRef<QueuedSpelling[]>(queue)
  const poolRef = useRef<SpellingTile[]>(poolTiles)
  const placedRef = useRef<Array<SpellingTile | null>>(placedTiles)
  const transitionTimerRef = useRef<number | null>(null)

  const commitQueue = useCallback((next: QueuedSpelling[]) => {
    queueRef.current = next
    setQueue(next)
  }, [])

  const commitTiles = useCallback(
    (nextPool: SpellingTile[], nextPlaced: Array<SpellingTile | null>) => {
      poolRef.current = nextPool
      placedRef.current = nextPlaced
      setPoolTiles(nextPool)
      setPlacedTiles(nextPlaced)
    },
    []
  )

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTransitionTimer()
      audioService.stopSpeech()
    }
  }, [clearTransitionTimer])

  const currentItem = queue[currentIndex]
  const currentWord = currentItem?.word

  const advanceToIndex = useCallback(
    (nextIdx: number) => {
      const latestQueue = queueRef.current
      if (nextIdx >= latestQueue.length) {
        setIsCompleted(true)
      } else {
        const nextWord = latestQueue[nextIdx].word
        const { pool, placed } = createTilesForWord(nextWord.term)
        setCurrentIndex(nextIdx)
        commitTiles(pool, placed)
        setIsSuccess(false)
        setIsWrong(false)
      }
    },
    [commitTiles]
  )

  const evaluateAnswer = useCallback(
    (slots: SpellingTile[]) => {
      if (!currentWord || !currentItem) return
      const spelledString = slots.map((s) => s.letter).join('')
      const isMatched =
        spelledString.toLowerCase().trim() === currentWord.term.toLowerCase().trim()

      if (isMatched) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {}
        }
        setIsSuccess(true)
        setIsWrong(false)
        audioService.playSuccessChime()
        storageService.updateWordStatus(currentWord.id, 'mastered')
        setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
        audioService.speak(currentWord.term)

        clearTransitionTimer()
        transitionTimerRef.current = window.setTimeout(() => {
          transitionTimerRef.current = null
          advanceToIndex(currentIndex + 1)
        }, 1200)
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 50, 80])
          } catch {}
        }
        setIsWrong(true)
        audioService.playErrorBuzz()
        storageService.updateWordStatus(currentWord.id, 'learning')
        setStats((prev) => ({ ...prev, review: prev.review + 1 }))

        if (currentItem.repetitionCount < 3) {
          commitQueue([
            ...queueRef.current,
            { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
          ])
        }
      }
    },
    [currentWord, currentItem, currentIndex, advanceToIndex, clearTransitionTimer, commitQueue]
  )

  const handleSelectPoolTile = useCallback(
    (tile: SpellingTile) => {
      if (isSuccess) return
      const prevPlaced = placedRef.current
      const firstEmptyIndex = prevPlaced.findIndex((slot) => slot === null)
      if (firstEmptyIndex === -1) return

      audioService.playClick()
      setIsWrong(false)

      const nextPlaced = [...prevPlaced]
      nextPlaced[firstEmptyIndex] = tile
      const nextPool = poolRef.current.filter((t) => t.tileId !== tile.tileId)

      commitTiles(nextPool, nextPlaced)

      if (nextPlaced.every((slot) => slot !== null)) {
        evaluateAnswer(nextPlaced as SpellingTile[])
      }
    },
    [isSuccess, commitTiles, evaluateAnswer]
  )

  const handleRemovePlacedTile = useCallback(
    (index: number) => {
      if (isSuccess) return
      const tile = placedRef.current[index]
      if (!tile || tile.tileId.startsWith('prefilled-')) return

      audioService.playClick()
      setIsWrong(false)

      const nextPlaced = [...placedRef.current]
      nextPlaced[index] = null
      const nextPool = [...poolRef.current, tile]
      commitTiles(nextPool, nextPlaced)
    },
    [isSuccess, commitTiles]
  )

  // Give 1-letter smart hint
  const handleHintOneLetter = () => {
    if (!currentWord || isSuccess) return
    audioService.playClick()
    setIsWrong(false)

    const targetChars = currentWord.term.split('')
    const nextPlaced = [...placedRef.current]
    let currentPool = [...poolRef.current]

    const targetSlotIndex = nextPlaced.findIndex(
      (slot, idx) =>
        slot === null || slot.letter.toLowerCase() !== targetChars[idx].toLowerCase()
    )

    if (targetSlotIndex === -1) return

    const neededChar = targetChars[targetSlotIndex].toLowerCase()

    // If that slot currently holds a wrong tile, return it to pool first
    const existingWrongTile = nextPlaced[targetSlotIndex]
    if (existingWrongTile && !existingWrongTile.tileId.startsWith('prefilled-')) {
      currentPool.push(existingWrongTile)
      nextPlaced[targetSlotIndex] = null
    }

    // Look for needed letter in pool; if not in pool, reclaim from another wrong slot
    let matchingTile = currentPool.find((t) => t.letter.toLowerCase() === neededChar)
    if (!matchingTile) {
      const donorIndex = nextPlaced.findIndex(
        (slot, idx) =>
          slot !== null &&
          !slot.tileId.startsWith('prefilled-') &&
          slot.letter.toLowerCase() === neededChar &&
          slot.letter.toLowerCase() !== targetChars[idx].toLowerCase()
      )
      if (donorIndex !== -1) {
        matchingTile = nextPlaced[donorIndex]!
        nextPlaced[donorIndex] = null
      }
    }

    if (!matchingTile) return

    currentPool = currentPool.filter((t) => t.tileId !== matchingTile!.tileId)
    nextPlaced[targetSlotIndex] = matchingTile

    commitTiles(currentPool, nextPlaced)

    if (nextPlaced.every((slot) => slot !== null)) {
      evaluateAnswer(nextPlaced as SpellingTile[])
    }
  }

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSuccess || !currentWord) return

      if (e.key === 'Backspace') {
        e.preventDefault()
        for (let i = placedRef.current.length - 1; i >= 0; i--) {
          const tile = placedRef.current[i]
          if (tile && !tile.tileId.startsWith('prefilled-')) {
            handleRemovePlacedTile(i)
            break
          }
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const pressedChar = e.key.toLowerCase()
        const matchingTile = poolRef.current.find((t) => t.letter.toLowerCase() === pressedChar)
        if (matchingTile) {
          e.preventDefault()
          handleSelectPoolTile(matchingTile)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSuccess, currentWord, handleRemovePlacedTile, handleSelectPoolTile])

  const handleClearAll = () => {
    if (!currentWord || isSuccess) return
    audioService.playClick()
    setIsWrong(false)
    const { pool, placed } = createTilesForWord(currentWord.term)
    commitTiles(pool, placed)
  }

  const handleReveal = () => {
    if (!currentWord || !currentItem || isSuccess) return
    audioService.playClick()

    const completedTiles: SpellingTile[] = currentWord.term.split('').map((char, index) => ({
      tileId: `revealed-${index}`,
      letter: char,
      originalIndex: index,
    }))

    commitTiles([], completedTiles)
    setIsWrong(false)
    setIsSuccess(true)

    storageService.updateWordStatus(currentWord.id, 'learning')
    setStats((prev) => ({ ...prev, review: prev.review + 1 }))

    if (currentItem.repetitionCount < 3) {
      commitQueue([
        ...queueRef.current,
        { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
      ])
    }

    audioService.speak(currentWord.term)

    clearTransitionTimer()
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null
      advanceToIndex(currentIndex + 1)
    }, 1500)
  }

  const startSessionWithWords = (targetWords: WordItem[]) => {
    clearTransitionTimer()
    const newQueue = targetWords.map((w) => ({ word: w, repetitionCount: 0 }))
    commitQueue(newQueue)
    if (targetWords[0]) {
      const { pool, placed } = createTilesForWord(targetWords[0].term)
      commitTiles(pool, placed)
    }
    setCurrentIndex(0)
    setStats({ mastered: 0, review: 0 })
    setIsSuccess(false)
    setIsWrong(false)
    setIsCompleted(false)
  }

  if (isCompleted) {
    const remainingList = storageService
      .getWords(deckId)
      .filter((w) => w.status !== 'mastered')
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'spelling',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => startSessionWithWords(rem)}
        onResetDeck={() => {
          void storageService.resetDeckProgress(deckId).then(() => {
            startSessionWithWords(storageService.getWords(deckId))
          })
        }}
        onBackToHome={onBack}
      />
    )
  }

  if (!currentWord) return null

  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100)
  const termLen = currentWord.term.length
  const sizeClasses =
    termLen > 16
      ? 'w-7 h-9 text-xs sm:w-8 sm:h-10 sm:text-sm'
      : termLen > 8
      ? 'w-8 h-10 text-sm sm:w-9 sm:h-11 sm:text-base'
      : 'w-10 h-12 text-lg'

  // Group character indices into non-breaking word segments separated by spaces
  const wordGroups: number[][] = []
  let currentGroup: number[] = []
  currentWord.term.split('').forEach((char, idx) => {
    if (char === ' ') {
      if (currentGroup.length > 0) {
        wordGroups.push(currentGroup)
        currentGroup = []
      }
    } else {
      currentGroup.push(idx)
    }
  })
  if (currentGroup.length > 0) {
    wordGroups.push(currentGroup)
  }

  return (
    <div className="w-full flex flex-col h-full max-w-md mx-auto px-3.5 py-2 select-none">
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
            Từ {currentIndex + 1} / {queue.length}
          </span>
          <div className="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-0.5 -mr-2">
          <button
            onClick={handleHintOneLetter}
            title="Gợi ý 1 chữ cái"
            className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
          </button>
          <button
            onClick={handleClearAll}
            title="Xếp lại từ đầu"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleReveal}
            title="Xem toàn bộ đáp án"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meaning & Audio Hint Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-4 relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Ghép chữ cái tiếng Anh
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => audioService.speak(currentWord.term, 0.6)}
              className="h-8 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title="Nghe chậm (0.6x)"
            >
              0.6x
            </button>
            <button
              onClick={() => audioService.speak(currentWord.term, 0.9)}
              className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title="Phát âm chuẩn"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug break-words px-2">
          {currentWord.definition}
        </h3>

        {currentWord.ipa && (
          <p className="text-sm font-sans tracking-wide text-indigo-600 dark:text-indigo-400 font-semibold mt-1.5">
            {currentWord.ipa}
          </p>
        )}
      </div>

      {/* Target Letter Slots Grouped by Word (No mid-word line breaks) */}
      <div
        className={`min-h-16 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2.5 p-3.5 rounded-2xl border transition-all my-auto ${
          isSuccess
            ? 'bg-emerald-500/10 border-emerald-500 shadow-sm'
            : isWrong
            ? 'bg-rose-500/10 border-rose-500 animate-shake'
            : 'bg-slate-100/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
        }`}
      >
        {wordGroups.map((groupIndices, gIdx) => (
          <div key={gIdx} className="inline-flex items-center gap-1">
            {groupIndices.map((index) => {
              const char = currentWord.term[index]
              const tile = placedTiles[index]

              if (/[^a-zA-Z0-9]/.test(char)) {
                return (
                  <span
                    key={index}
                    className="px-0.5 text-lg font-bold text-slate-400 dark:text-slate-500 select-none flex items-center"
                  >
                    {char}
                  </span>
                )
              }

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
        ))}
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
          Chưa đúng, chạm chữ để gỡ ra hoặc bấm biểu tượng bóng đèn để gợi ý 1 chữ.
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
              className="w-11 h-12 rounded-xl bg-white dark:bg-slate-800 border-b-3 border border-slate-300 dark:border-slate-700 font-bold text-lg text-slate-900 dark:text-slate-100 shadow-sm hover:border-indigo-500 active:translate-y-0.5 active:border-b transition-all flex items-center justify-center"
            >
              {tile.letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
