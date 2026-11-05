import { ArrowLeft, Check, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
}

// Fisher-Yates shuffle algorithm
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

export function QuizView({ words, deckName, onBack }: QuizViewProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)

  // Generate quiz questions
  useEffect(() => {
    if (!words || words.length === 0) return

    // Pool of potential distractors (current deck + fallback to INITIAL_WORDS per B4 fix)
    const distractorPool = [
      ...words.map((w) => w.definition),
      ...INITIAL_WORDS.map((w) => w.definition),
    ]

    const generatedQuestions: QuizQuestion[] = words.map((targetWord) => {
      const correctDef = targetWord.definition.trim()

      // Find 3 unique distractors
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
      }
    })

    setQuestions(shuffleArray(generatedQuestions))
    setCurrentIndex(0)
    setIsLocked(false)
    setSelectedOption(null)
  }, [words])

  const currentQ = questions[currentIndex]

  // Speak word on load
  useEffect(() => {
    if (currentQ && !isCompleted) {
      audioService.speak(currentQ.targetWord.term)
    }
  }, [currentIndex, currentQ, isCompleted])

  // Desktop keyboard shortcuts 1, 2, 3, 4
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked || isCompleted) return
      const key = e.key
      if (['1', '2', '3', '4'].includes(key)) {
        const optionIndex = parseInt(key, 10) - 1
        handleSelect(optionIndex)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLocked, isCompleted, currentQ])

  const handleSelect = (index: number) => {
    if (isLocked || !currentQ) return

    setIsLocked(true)
    setSelectedOption(index)

    const isCorrect = index === currentQ.correctOptionIndex

    if (isCorrect) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)
      audioService.playSuccessChime()
      storageService.updateWordStatus(currentQ.targetWord.id, 'mastered')
      setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
    } else {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([80, 50, 80])
      audioService.playErrorBuzz()
      storageService.updateWordStatus(currentQ.targetWord.id, 'learning')
      setStats((prev) => ({ ...prev, review: prev.review + 1 }))
    }

    // Auto transition after 800ms
    setTimeout(() => {
      if (currentIndex + 1 >= questions.length) {
        setIsCompleted(true)
      } else {
        setCurrentIndex((prev) => prev + 1)
        setSelectedOption(null)
        setIsLocked(false)
      }
    }, 850)
  }

  if (isCompleted) {
    const sessionStats: StudySessionStats = {
      totalWords: questions.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'quiz',
      deckName,
    }
    return (
      <StudySummary
        stats={sessionStats}
        onRestart={() => {
          setCurrentIndex(0)
          setSelectedOption(null)
          setIsLocked(false)
          setStats({ mastered: 0, review: 0 })
          setIsCompleted(false)
        }}
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
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Câu {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-24 bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="w-9" /> {/* Spacer */}
      </div>

      {/* Target Word Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-6 relative">
        <button
          onClick={() => audioService.speak(currentQ.targetWord.term)}
          className="absolute right-4 top-4 w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Volume2 className="w-4 h-4" />
        </button>

        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 block">
          Chọn nghĩa tiếng Việt đúng
        </span>

        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          {currentQ.targetWord.term}
        </h2>

        {currentQ.targetWord.ipa && (
          <p className="text-sm font-mono text-slate-400 dark:text-slate-500 mt-1">
            {currentQ.targetWord.ipa}
          </p>
        )}
      </div>

      {/* 4 Options Grid */}
      <div className="space-y-3 flex-1 flex flex-col justify-center">
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
              className={`w-full py-4 px-4 rounded-2xl border text-left text-sm font-medium transition-all flex items-center justify-between shadow-xs active:scale-98 ${buttonStyle}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-400">
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
