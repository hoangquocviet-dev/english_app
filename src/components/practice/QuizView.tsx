import { ArrowLeft, Check, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface QuizViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
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

function buildQuestions(sourceWords: WordItem[], fullDeckWords: WordItem[]): QuizQuestion[] {
  const rawPool =
    fullDeckWords.length >= 6
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 40)]

  // Pre-deduplicate candidate pool once in O(N) instead of O(N^2) per question
  const seenDefs = new Set<string>()
  const uniqueCandidates: Array<{ termLower: string; def: string; defLower: string }> = []
  for (const w of rawPool) {
    const def = w.definition.trim()
    const defLower = def.toLowerCase()
    if (!seenDefs.has(defLower)) {
      seenDefs.add(defLower)
      uniqueCandidates.push({
        termLower: w.term.trim().toLowerCase(),
        def,
        defLower,
      })
    }
  }

  const generated: QuizQuestion[] = sourceWords.map((targetWord) => {
    const correctDef = targetWord.definition.trim()
    const correctLower = correctDef.toLowerCase()
    const targetTermLower = targetWord.term.trim().toLowerCase()

    // Fast O(1) random sampling of 3 distinct distractors
    const picked: string[] = []
    const pickedLower = new Set<string>([correctLower])
    const poolLen = uniqueCandidates.length

    for (let attempts = 0; attempts < 24 && picked.length < 3 && poolLen > 1; attempts++) {
      const cand = uniqueCandidates[Math.floor(Math.random() * poolLen)]
      if (cand.termLower !== targetTermLower && !pickedLower.has(cand.defLower)) {
        pickedLower.add(cand.defLower)
        picked.push(cand.def)
      }
    }

    if (picked.length < 3) {
      for (const cand of uniqueCandidates) {
        if (picked.length >= 3) break
        if (cand.termLower !== targetTermLower && !pickedLower.has(cand.defLower)) {
          pickedLower.add(cand.defLower)
          picked.push(cand.def)
        }
      }
    }

    const shuffledOptions = shuffleArray([correctDef, ...picked])
    const correctIndex = shuffledOptions.indexOf(correctDef)

    return {
      targetWord,
      options: shuffledOptions,
      correctOptionIndex: correctIndex,
      repetitionCount: 0,
    }
  })

  return shuffleArray(generated)
}

export function QuizView({ words, allDeckWords, deckId, deckName, onBack }: QuizViewProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    buildQuestions(words, allDeckWords)
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
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

  // Auto speak word on load
  useEffect(() => {
    if (currentQ && !isCompleted) {
      audioService.speakAuto(currentQ.targetWord.term)
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

        // Re-queue missed word once with re-shuffled options
        if (currentQ.repetitionCount < 2) {
          wasRequeued = true
          const correctDef = currentQ.options[currentQ.correctOptionIndex]
          const reshuffledOptions = shuffleArray(currentQ.options)
          setQuestions((prev) => [
            ...prev,
            {
              targetWord: currentQ.targetWord,
              options: reshuffledOptions,
              correctOptionIndex: reshuffledOptions.indexOf(correctDef),
              repetitionCount: currentQ.repetitionCount + 1,
            },
          ])
        }
      }

      const delay = isCorrect ? 800 : 1700
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

  // Desktop keyboard shortcuts 1, 2, 3, 4
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked || isCompleted || !currentQ) return
      const key = e.key
      if (['1', '2', '3', '4'].includes(key)) {
        const optionIndex = parseInt(key, 10) - 1
        if (optionIndex < currentQ.options.length) {
          handleSelect(optionIndex)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLocked, isCompleted, currentQ, handleSelect])

  const resetQuiz = (sourceWords: WordItem[]) => {
    clearTransitionTimer()
    setQuestions(buildQuestions(sourceWords, allDeckWords))
    setCurrentIndex(0)
    setSelectedOption(null)
    setIsLocked(false)
    setStats({ mastered: 0, review: 0 })
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
      mode: 'quiz',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => resetQuiz(rem)}
        onResetDeck={() => {
          void storageService.resetDeckProgress(deckId).then(() => {
            resetQuiz(storageService.getWords(deckId))
          })
        }}
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
            Câu {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="w-9" />
      </div>

      {/* Target Word Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-5 relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Chọn nghĩa tiếng Việt đúng
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => audioService.speak(currentQ.targetWord.term, 0.6)}
              className="h-8 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title="Nghe chậm (0.6x)"
            >
              0.6x
            </button>
            <button
              onClick={() => audioService.speak(currentQ.targetWord.term, 0.9)}
              className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title="Phát âm chuẩn"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words mt-1">
          {currentQ.targetWord.term}
        </h2>

        {currentQ.targetWord.ipa && (
          <p className="text-sm font-sans font-medium tracking-wide text-slate-400 dark:text-slate-500 mt-1">
            {currentQ.targetWord.ipa}
          </p>
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
                <span className="leading-snug break-words line-clamp-3">{option}</span>
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
