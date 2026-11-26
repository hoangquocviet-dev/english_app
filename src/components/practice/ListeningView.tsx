import { ArrowLeft, Check, Headphones, Star, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudySessionStats, WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface ListeningViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onBack: () => void
}

interface ListeningOption {
  id: string
  term: string
  definition: string
}

interface ListeningQuestion {
  targetWord: WordItem
  options: ListeningOption[]
  correctOptionIndex: number
  repetitionCount: number
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

function buildListeningQuestions(
  sourceWords: WordItem[],
  fullDeckWords: WordItem[]
): ListeningQuestion[] {
  const rawList =
    fullDeckWords.length >= 6
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 40)]

  // Deduplicate pool once in O(N)
  const seenTerms = new Set<string>()
  const uniquePool: Array<ListeningOption & { termKey: string }> = []
  for (const w of rawList) {
    const termKey = w.term.trim().toLowerCase()
    if (!seenTerms.has(termKey)) {
      seenTerms.add(termKey)
      uniquePool.push({ id: w.id, term: w.term, definition: w.definition, termKey })
    }
  }

  const poolLen = uniquePool.length

  const generated: ListeningQuestion[] = sourceWords.map((targetWord) => {
    const targetKey = targetWord.term.trim().toLowerCase()
    const picked: ListeningOption[] = []
    const pickedKeys = new Set<string>([targetKey])

    // Fast O(1) random sampling of 3 distractors
    for (let attempts = 0; attempts < 24 && picked.length < 3 && poolLen > 1; attempts++) {
      const cand = uniquePool[Math.floor(Math.random() * poolLen)]
      if (!pickedKeys.has(cand.termKey)) {
        pickedKeys.add(cand.termKey)
        picked.push({ id: cand.id, term: cand.term, definition: cand.definition })
      }
    }

    if (picked.length < 3) {
      for (const cand of uniquePool) {
        if (picked.length >= 3) break
        if (!pickedKeys.has(cand.termKey)) {
          pickedKeys.add(cand.termKey)
          picked.push({ id: cand.id, term: cand.term, definition: cand.definition })
        }
      }
    }

    const correctOpt: ListeningOption = {
      id: targetWord.id,
      term: targetWord.term,
      definition: targetWord.definition,
    }

    const shuffledOptions = shuffleArray([correctOpt, ...picked])
    const correctOptionIndex = shuffledOptions.findIndex(
      (o) => o.term.trim().toLowerCase() === targetKey
    )

    return {
      targetWord,
      options: shuffledOptions,
      correctOptionIndex,
      repetitionCount: 0,
    }
  })

  return shuffleArray(generated)
}

export function ListeningView({
  words,
  allDeckWords,
  deckId,
  deckName,
  filterMode = 'all',
  onBack,
}: ListeningViewProps) {
  const [questions, setQuestions] = useState<ListeningQuestion[]>(() =>
    buildListeningQuestions(words, allDeckWords)
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
  const [starredIds, setStarredIds] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.starred).map((w) => w.id))
  )
  const transitionTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTransitionTimer()
      audioService.stopSpeech()
    }
  }, [clearTransitionTimer])

  const currentQ = questions[currentIndex]

  const playAudio = useCallback(
    async (rate: number = 0.9) => {
      if (!currentQ) return
      setIsPlaying(true)
      await audioService.speak(currentQ.targetWord.term, rate)
      if (mountedRef.current) {
        setIsPlaying(false)
      }
    },
    [currentQ]
  )

  // Always play audio when question appears in Listening Mode
  useEffect(() => {
    if (currentQ && !isCompleted) {
      audioService.speak(currentQ.targetWord.term, 0.9)
    }
  }, [currentIndex, currentQ, isCompleted])

  const handleSelect = useCallback(
    (index: number) => {
      if (isLocked || !currentQ) return

      setIsLocked(true)
      setSelectedOption(index)

      const isCorrect = index === currentQ.correctOptionIndex
      let wasRequeued = false

      if (isCorrect) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(35)
          } catch {}
        }
        audioService.playSuccessChime()
        storageService.updateWordStatus(currentQ.targetWord.id, 'mastered')
        setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 50, 80])
          } catch {}
        }
        audioService.playErrorBuzz()
        storageService.updateWordStatus(currentQ.targetWord.id, 'learning')
        setStats((prev) => ({ ...prev, review: prev.review + 1 }))

        if (currentQ.repetitionCount < 2) {
          wasRequeued = true
          const targetKey = currentQ.targetWord.term.trim().toLowerCase()
          const reshuffled = shuffleArray(currentQ.options)
          setQuestions((prev) => [
            ...prev,
            {
              targetWord: currentQ.targetWord,
              options: reshuffled,
              correctOptionIndex: reshuffled.findIndex(
                (o) => o.term.trim().toLowerCase() === targetKey
              ),
              repetitionCount: currentQ.repetitionCount + 1,
            },
          ])
        }
      }

      const delay = isCorrect ? 1000 : 1850
      const nextTotal = questions.length + (wasRequeued ? 1 : 0)

      clearTransitionTimer()
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null
        if (currentIndex + 1 >= nextTotal) {
          setIsCompleted(true)
        } else {
          setCurrentIndex((prev) => prev + 1)
          setSelectedOption(null)
          setIsLocked(false)
        }
      }, delay)
    },
    [isLocked, currentQ, questions.length, currentIndex, clearTransitionTimer]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || !currentQ) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      } else if (e.code === 'Space') {
        e.preventDefault()
        void playAudio(0.9)
      } else if (!isLocked && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < currentQ.options.length) {
          handleSelect(idx)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLocked, isCompleted, currentQ, playAudio, handleSelect, onBack])

  const resetListening = (sourceWords: WordItem[]) => {
    clearTransitionTimer()
    setQuestions(buildListeningQuestions(sourceWords, allDeckWords))
    setCurrentIndex(0)
    setSelectedOption(null)
    setIsLocked(false)
    setStats({ mastered: 0, review: 0 })
    setIsCompleted(false)
  }

  if (isCompleted) {
    const remainingList = storageService.getRemainingWordsForSession(deckId, words, filterMode)
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'listening',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => resetListening(rem)}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  resetListening(storageService.getWords(deckId))
                })
              }
        }
        onBackToHome={onBack}
      />
    )
  }

  if (!currentQ) return null

  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100)

  return (
    <div className="w-full flex flex-col my-auto max-w-md sm:max-w-lg mx-auto px-3.5 py-2 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          title="Quay lại"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Nghe {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-violet-600 dark:bg-violet-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            audioService.playClick()
            const next = storageService.toggleWordStar(currentQ.targetWord.id)
            setStarredIds((prev) => {
              const copy = new Set(prev)
              if (next) copy.add(currentQ.targetWord.id)
              else copy.delete(currentQ.targetWord.id)
              return copy
            })
          }}
          title="Đánh dấu sao từ này"
          className={`p-2 rounded-lg transition-colors ${
            starredIds.has(currentQ.targetWord.id)
              ? 'text-amber-500'
              : 'text-slate-400 hover:text-amber-500'
          }`}
        >
          <Star
            className={`w-4.5 h-4.5 ${
              starredIds.has(currentQ.targetWord.id) ? 'fill-amber-400' : ''
            }`}
          />
        </button>
      </div>

      {/* Audio Prompt Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-5">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-3">
          Lắng nghe phát âm và chọn từ đúng
        </span>

        <div className="flex items-center justify-center gap-3 my-2">
          <button
            type="button"
            onClick={() => playAudio(0.9)}
            className={`w-16 h-16 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/25 active:scale-95 transition-all ${
              isPlaying ? 'ring-4 ring-violet-500/30 scale-105' : ''
            }`}
            title="Nghe tốc độ chuẩn"
          >
            {isPlaying ? (
              <Volume2 className="w-8 h-8 animate-pulse" />
            ) : (
              <Headphones className="w-8 h-8" />
            )}
          </button>

          <button
            type="button"
            onClick={() => playAudio(0.6)}
            className="h-12 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            title="Nghe chậm rõ từng âm (0.6x)"
          >
            <Volume2 className="w-4 h-4 text-violet-500" />
            <span>Chậm 0.6x</span>
          </button>
        </div>

        {/* Reveal word & IPA after answering */}
        {isLocked ? (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 animate-fadeIn">
            <div className="text-xl font-extrabold text-slate-900 dark:text-slate-50">
              {currentQ.targetWord.term}
            </div>
            {currentQ.targetWord.ipa && (
              <div className="text-xs font-sans font-semibold text-violet-600 dark:text-violet-400 mt-0.5">
                {currentQ.targetWord.ipa}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Chạm vào biểu tượng tai nghe để nghe lại
          </p>
        )}
      </div>

      {/* 4 Options */}
      <div className="space-y-2.5 flex-1 flex flex-col justify-center">
        {currentQ.options.map((option, idx) => {
          const isSelected = selectedOption === idx
          const isCorrect = idx === currentQ.correctOptionIndex

          let buttonStyle =
            'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700/80 hover:border-violet-400'

          if (isLocked) {
            if (isCorrect) {
              buttonStyle =
                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500 font-semibold'
            } else if (isSelected) {
              buttonStyle =
                'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500 font-semibold animate-shake'
            } else {
              buttonStyle = 'opacity-40 border-transparent bg-slate-100 dark:bg-slate-800/40'
            }
          }

          return (
            <button
              key={option.id + '-' + idx}
              disabled={isLocked}
              onClick={() => handleSelect(idx)}
              className={`w-full py-3 px-3.5 rounded-2xl border text-left transition-all flex items-center justify-between shadow-xs active:scale-98 ${buttonStyle}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {option.term}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {formatArcadeMeaning(
                      option.definition.replace(
                        /^Kỹ thuật (?:refactoring|tái cấu trúc(?: mã nguồn)?(?:\s+bằng cách)?)\s+/i,
                        ''
                      ),
                      76
                    )}
                  </div>
                </div>
              </div>

              {isLocked && isCorrect && <Check className="w-5 h-5 text-emerald-500 shrink-0 ml-2" />}
              {isLocked && isSelected && !isCorrect && (
                <X className="w-5 h-5 text-rose-500 shrink-0 ml-2" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
