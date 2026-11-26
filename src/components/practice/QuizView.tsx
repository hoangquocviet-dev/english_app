import { ArrowLeft, ArrowLeftRight, Check, Star, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

export type QuizDirection = 'en-vi' | 'vi-en'

const QUIZ_DIR_STORAGE_KEY = 'vocabflow_quiz_dir'

interface QuizViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onBack: () => void
}

interface QuizQuestion {
  targetWord: WordItem
  options: string[]
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

function buildQuestions(
  sourceWords: WordItem[],
  fullDeckWords: WordItem[],
  direction: QuizDirection
): QuizQuestion[] {
  const rawPool =
    fullDeckWords.length >= 6
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 50)]

  interface Candidate {
    term: string
    termLower: string
    def: string
    defLower: string
    pos: string
  }

  // Pre-deduplicate candidate pool once in O(N)
  const seenKeys = new Set<string>()
  const uniqueCandidates: Candidate[] = []
  for (const w of rawPool) {
    const term = w.term.trim()
    const termLower = term.toLowerCase()
    const def = w.definition.trim()
    const defLower = def.toLowerCase()
    const dedupKey = direction === 'en-vi' ? defLower : termLower
    if (!seenKeys.has(dedupKey)) {
      seenKeys.add(dedupKey)
      uniqueCandidates.push({
        term,
        termLower,
        def,
        defLower,
        pos: (w.partOfSpeech || '').trim().toLowerCase(),
      })
    }
  }

  // Group by partOfSpeech so distractors feel realistic (verb vs verb, noun vs noun)
  const byPos = new Map<string, Candidate[]>()
  for (const c of uniqueCandidates) {
    if (!c.pos) continue
    const list = byPos.get(c.pos)
    if (list) list.push(c)
    else byPos.set(c.pos, [c])
  }

  const generated: QuizQuestion[] = sourceWords.map((targetWord) => {
    const correctText =
      direction === 'en-vi' ? targetWord.definition.trim() : targetWord.term.trim()
    const correctLower = correctText.toLowerCase()
    const targetTermLower = targetWord.term.trim().toLowerCase()
    const targetDefLower = targetWord.definition.trim().toLowerCase()
    const targetPos = (targetWord.partOfSpeech || '').trim().toLowerCase()

    const picked: string[] = []
    const pickedLower = new Set<string>([correctLower])

    const tryPickFrom = (pool: Candidate[]) => {
      const eligible = pool.filter((cand) => {
        const valLower = direction === 'en-vi' ? cand.defLower : cand.termLower
        return (
          cand.termLower !== targetTermLower &&
          cand.defLower !== targetDefLower &&
          !pickedLower.has(valLower)
        )
      })
      if (eligible.length === 0) return

      // Sort by closest text length so long definitions never stand out among short ones, then sample from top 8
      eligible.sort((a, b) => {
        const lenA = direction === 'en-vi' ? a.def.length : a.term.length
        const lenB = direction === 'en-vi' ? b.def.length : b.term.length
        return Math.abs(lenA - correctText.length) - Math.abs(lenB - correctText.length)
      })

      const topSlice = shuffleArray(eligible.slice(0, Math.min(8, eligible.length)))
      for (const cand of topSlice) {
        if (picked.length >= 3) break
        const val = direction === 'en-vi' ? cand.def : cand.term
        const valLower = direction === 'en-vi' ? cand.defLower : cand.termLower
        if (!pickedLower.has(valLower)) {
          pickedLower.add(valLower)
          picked.push(val)
        }
      }
    }

    // 1. Prefer same part-of-speech distractors with similar length
    const samePosPool = targetPos ? byPos.get(targetPos) : undefined
    if (samePosPool && samePosPool.length >= 4) {
      tryPickFrom(samePosPool)
    }

    // 2. Fill remaining from general pool with similar length
    if (picked.length < 3) {
      tryPickFrom(uniqueCandidates)
    }

    if (picked.length < 3) {
      for (const cand of uniqueCandidates) {
        if (picked.length >= 3) break
        const val = direction === 'en-vi' ? cand.def : cand.term
        const valLower = direction === 'en-vi' ? cand.defLower : cand.termLower
        if (
          cand.termLower !== targetTermLower &&
          cand.defLower !== targetDefLower &&
          !pickedLower.has(valLower)
        ) {
          pickedLower.add(valLower)
          picked.push(val)
        }
      }
    }

    const shuffledOptions = shuffleArray([correctText, ...picked])
    const correctIndex = shuffledOptions.indexOf(correctText)

    return {
      targetWord,
      options: shuffledOptions,
      correctOptionIndex: correctIndex,
      repetitionCount: 0,
    }
  })

  return shuffleArray(generated)
}

export function QuizView({
  words,
  allDeckWords,
  deckId,
  deckName,
  filterMode = 'all',
  onBack,
}: QuizViewProps) {
  const [direction, setDirection] = useState<QuizDirection>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(QUIZ_DIR_STORAGE_KEY)
      if (saved === 'vi-en' || saved === 'en-vi') return saved
    }
    return 'en-vi'
  })
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    buildQuestions(words, allDeckWords, direction)
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
  const [starredIds, setStarredIds] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.starred).map((w) => w.id))
  )
  const transitionTimerRef = useRef<number | null>(null)

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

  const currentQ = questions[currentIndex]

  // Auto speak word on load ONLY in English -> Vietnamese mode (don't spoil answer in Vi -> En!)
  useEffect(() => {
    if (currentQ && !isCompleted && direction === 'en-vi') {
      void audioService.speakAuto(currentQ.targetWord.term)
    }
  }, [currentIndex, currentQ, isCompleted, direction])

  const handleToggleDirection = () => {
    audioService.playClick()
    clearTransitionTimer()
    const nextDir: QuizDirection = direction === 'en-vi' ? 'vi-en' : 'en-vi'
    setDirection(nextDir)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(QUIZ_DIR_STORAGE_KEY, nextDir)
      } catch {}
    }
    // Rebuild remaining questions in the new direction without losing session progress
    const remainingSource = questions.slice(currentIndex).map((q) => q.targetWord)
    const rebuilt = buildQuestions(
      remainingSource.length > 0 ? remainingSource : words,
      allDeckWords,
      nextDir
    )
    setQuestions([...questions.slice(0, currentIndex), ...rebuilt])
    setSelectedOption(null)
    setIsLocked(false)
  }

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
        if (direction === 'vi-en') {
          void audioService.speakAuto(currentQ.targetWord.term, 0.9)
        }
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 50, 80])
          } catch {}
        }
        audioService.playErrorBuzz()
        storageService.updateWordStatus(currentQ.targetWord.id, 'learning')
        setStats((prev) => ({ ...prev, review: prev.review + 1 }))
        if (direction === 'vi-en') {
          void audioService.speakAuto(currentQ.targetWord.term, 0.9)
        }

        // Re-queue missed word with re-shuffled options
        if (currentQ.repetitionCount < 2) {
          wasRequeued = true
          const correctVal = currentQ.options[currentQ.correctOptionIndex]
          const reshuffledOptions = shuffleArray(currentQ.options)
          setQuestions((prev) => [
            ...prev,
            {
              targetWord: currentQ.targetWord,
              options: reshuffledOptions,
              correctOptionIndex: reshuffledOptions.indexOf(correctVal),
              repetitionCount: currentQ.repetitionCount + 1,
            },
          ])
        }
      }

      const delay = isCorrect ? 850 : 1750
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
    [isLocked, currentQ, direction, questions.length, currentIndex, clearTransitionTimer]
  )

  // Desktop keyboard shortcuts: 1-4 answer, Space replay audio, Escape exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || !currentQ) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }
      if (e.code === 'Space') {
        if (direction === 'en-vi' || isLocked) {
          e.preventDefault()
          void audioService.speak(currentQ.targetWord.term, 0.9)
        }
        return
      }
      if (!isLocked && ['1', '2', '3', '4'].includes(e.key)) {
        const optionIndex = parseInt(e.key, 10) - 1
        if (optionIndex < currentQ.options.length) {
          handleSelect(optionIndex)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLocked, isCompleted, currentQ, direction, handleSelect, onBack])

  const resetQuiz = (sourceWords: WordItem[]) => {
    clearTransitionTimer()
    setQuestions(buildQuestions(sourceWords, allDeckWords, direction))
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
      mode: 'quiz',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => resetQuiz(rem)}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  resetQuiz(storageService.getWords(deckId))
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
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={onBack}
          title="Quay lại (Esc)"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Câu {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleDirection}
          title="Đổi chiều câu hỏi: Anh → Việt hoặc Việt → Anh"
          className="py-1.5 px-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-all"
        >
          <ArrowLeftRight className="w-3 h-3 shrink-0" />
          <span>{direction === 'en-vi' ? 'Anh → Việt' : 'Việt → Anh'}</span>
        </button>
      </div>

      {/* Target Prompt Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-5 relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {direction === 'en-vi' ? 'Chọn nghĩa tiếng Việt đúng' : 'Chọn từ tiếng Anh đúng'}
          </span>

          <div className="flex items-center gap-1.5">
            {direction === 'vi-en' && !isLocked && currentQ.targetWord.partOfSpeech && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase">
                {currentQ.targetWord.partOfSpeech}
              </span>
            )}
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
              title="Đánh dấu sao từ quan trọng"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                starredIds.has(currentQ.targetWord.id)
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-slate-100 dark:bg-slate-700/70 text-slate-400 hover:text-amber-500'
              }`}
            >
              <Star
                className={`w-4 h-4 ${
                  starredIds.has(currentQ.targetWord.id) ? 'fill-amber-400' : ''
                }`}
              />
            </button>
            {(direction === 'en-vi' || isLocked) && (
              <>
                <button
                  onClick={() => void audioService.speak(currentQ.targetWord.term, 0.6)}
                  className="h-8 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Nghe chậm (0.6x)"
                >
                  0.6x
                </button>
                <button
                  onClick={() => void audioService.speak(currentQ.targetWord.term, 0.9)}
                  className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Phát âm chuẩn (Space)"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {direction === 'en-vi' ? (
          <>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words mt-1">
              {currentQ.targetWord.term}
            </h2>
            {currentQ.targetWord.ipa && (
              <p className="text-sm font-sans font-medium tracking-wide text-slate-400 dark:text-slate-500 mt-1">
                {currentQ.targetWord.ipa}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 leading-snug break-words mt-1">
              {currentQ.targetWord.definition}
            </h2>
            {isLocked && (
              <p className="text-sm font-sans font-semibold text-indigo-600 dark:text-indigo-400 mt-1.5 animate-fadeIn">
                {currentQ.targetWord.term}
                {currentQ.targetWord.ipa ? ` ${currentQ.targetWord.ipa}` : ''}
              </p>
            )}
          </>
        )}

        {isLocked && selectedOption !== currentQ.correctOptionIndex && currentQ.targetWord.example && (
          <p className="text-xs italic text-indigo-600 dark:text-indigo-400 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
            "{currentQ.targetWord.example}"
          </p>
        )}
      </div>

      {/* 4 Options Grid */}
      <div className="space-y-2.5 flex-1 flex flex-col justify-center">
        {currentQ.options.map((option, idx) => {
          const isSelected = selectedOption === idx
          const isCorrect = idx === currentQ.correctOptionIndex

          let buttonStyle =
            'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700/80 hover:border-indigo-400'

          if (isLocked) {
            if (isCorrect) {
              buttonStyle =
                'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500 font-semibold'
            } else if (isSelected) {
              buttonStyle =
                'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500 font-semibold animate-shake'
            } else {
              buttonStyle = 'opacity-40 border-transparent bg-slate-100 dark:bg-slate-800/40'
            }
          }

          return (
            <button
              key={idx}
              disabled={isLocked}
              onClick={() => handleSelect(idx)}
              className={`w-full py-3.5 px-4 rounded-2xl border text-left text-sm font-medium transition-all flex items-center justify-between shadow-xs active:scale-98 ${buttonStyle}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                  {idx + 1}
                </span>
                <span
                  className={`leading-snug break-words line-clamp-3 ${
                    direction === 'vi-en' ? 'font-bold text-base' : ''
                  }`}
                >
                  {option}
                </span>
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
