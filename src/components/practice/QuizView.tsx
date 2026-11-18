import { ArrowLeft, Check, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { INITIAL_WORDS } from '../../data/initialDecks'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface QuizViewProps {
  words: WordItem[]
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

function buildQuestions(sourceWords: WordItem[]): QuizQuestion[] {
  const distractorPool = [
    ...sourceWords.map((w) => w.definition),
    ...INITIAL_WORDS.map((w) => w.definition),
  ]

  const generated: QuizQuestion[] = sourceWords.map((targetWord) => {
    const correctDef = targetWord.definition.trim()
    const availableDistractors = distractorPool.filter(
      (def) => def.trim().toLowerCase() !== correctDef.toLowerCase()
    )
    const uniqueDistractors = Array.from(new Set(availableDistractors))
    const shuffledDistractors = shuffleArray(uniqueDistractors).slice(0, 3)

    const rawOptions = [correctDef, ...shuffledDistractors]
    const shuffledOptions = shuffleArray(rawOptions)
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

export function QuizView({ words, deckName, onBack }: QuizViewProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => buildQuestions(words))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [missedWordsMap, setMissedWordsMap] = useState<Record<string, WordItem>>({})
  const [isCompleted, setIsCompleted] = useState(false)

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
        setMissedWordsMap((prev) => ({
          ...prev,
          [currentQ.targetWord.id]: currentQ.targetWord,
        }))

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

      setTimeout(() => {
        if (currentIndex + 1 >= nextTotal) {
          setIsCompleted(true)
        } else {
          setCurrentIndex((prev) => prev + 1)
          setSelectedOption(null)
          setIsLocked(false)
        }
      }, delay)
    },
    [isLocked, currentQ, questions.length, currentIndex]
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
    setQuestions(buildQuestions(sourceWords))
    setCurrentIndex(0)
    setSelectedOption(null)
    setIsLocked(false)
    setStats({ mastered: 0, review: 0 })
    setMissedWordsMap({})
    setIsCompleted(false)
  }

  if (isCompleted) {
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'quiz',
      deckName,
      missedWords: Object.values(missedWordsMap),
    }
    return (
      <StudySummary
        stats={sessionStats}
        onRestart={() => resetQuiz(words)}
        onPracticeMissed={(missed) => resetQuiz(missed)}
        onBackToHome={onBack}
      />
    )
  }

  if (!currentQ) return null

  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100)

  return (
    <div className="w-full flex flex-col h-full max-w-md mx-auto px-3.5 py-2 select-none">
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
                <span className="leading-snug break-words">{option}</span>
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
