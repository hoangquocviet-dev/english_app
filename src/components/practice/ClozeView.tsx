import { ArrowLeft, Check, FileText, Sparkles, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

interface ClozeViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  onBack: () => void
}

interface ClozeOption {
  id: string
  term: string
}

interface ClozeQuestion {
  targetWord: WordItem
  sentence: string
  sentenceBefore: string
  sentenceAfter: string
  matchedTerm: string
  options: ClozeOption[]
  correctOptionIndex: number
  repetitionCount: number
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function splitClozeSentence(
  sentence: string,
  term: string
): { sentenceBefore: string; sentenceAfter: string; matchedTerm: string } {
  // 1. Try whole word/phrase boundary match
  const pattern = new RegExp(`(^|[^a-zA-Z0-9_-])(${escapeRegExp(term)})([^a-zA-Z0-9_-]|$)`, 'i')
  const match = pattern.exec(sentence)

  if (match && typeof match.index === 'number') {
    const prefixLen = match[1].length
    const matchStart = match.index + prefixLen
    const matchedTerm = match[2]
    const matchEnd = matchStart + matchedTerm.length
    return {
      sentenceBefore: sentence.slice(0, matchStart),
      sentenceAfter: sentence.slice(matchEnd),
      matchedTerm,
    }
  }

  // 2. Fallback: simple case-insensitive substring
  const subIdx = sentence.toLowerCase().indexOf(term.toLowerCase())
  if (subIdx !== -1) {
    const matchedTerm = sentence.slice(subIdx, subIdx + term.length)
    return {
      sentenceBefore: sentence.slice(0, subIdx),
      sentenceAfter: sentence.slice(subIdx + term.length),
      matchedTerm,
    }
  }

  // 3. Fallback if term not in sentence: create a structured context
  return {
    sentenceBefore: 'In software engineering, [',
    sentenceAfter: `] is used to: ${sentence}`,
    matchedTerm: term,
  }
}

function buildClozeQuestions(
  sourceWords: WordItem[],
  fullDeckWords: WordItem[]
): ClozeQuestion[] {
  const poolSource =
    fullDeckWords.length >= 6
      ? fullDeckWords
      : [...fullDeckWords, ...storageService.getWords().slice(0, 50)]

  // Deduplicate pool
  const seenTerms = new Set<string>()
  const uniquePool: ClozeOption[] = []
  for (const w of poolSource) {
    const termKey = w.term.trim().toLowerCase()
    if (!seenTerms.has(termKey)) {
      seenTerms.add(termKey)
      uniquePool.push({ id: w.id, term: w.term })
    }
  }

  const poolLen = uniquePool.length

  const questions: ClozeQuestion[] = sourceWords.map((targetWord) => {
    const targetKey = targetWord.term.trim().toLowerCase()
    const sentence =
      targetWord.example?.trim() ||
      `${targetWord.term} plays a key role: ${targetWord.definition}.`

    const { sentenceBefore, sentenceAfter, matchedTerm } = splitClozeSentence(
      sentence,
      targetWord.term
    )

    const pickedDistractors: ClozeOption[] = []
    const pickedKeys = new Set<string>([targetKey])

    // Fast sampling of 3 distractors
    for (let attempts = 0; attempts < 30 && pickedDistractors.length < 3 && poolLen > 1; attempts++) {
      const cand = uniquePool[Math.floor(Math.random() * poolLen)]
      const candKey = cand.term.trim().toLowerCase()
      if (!pickedKeys.has(candKey)) {
        pickedKeys.add(candKey)
        pickedDistractors.push(cand)
      }
    }

    if (pickedDistractors.length < 3) {
      for (const cand of uniquePool) {
        if (pickedDistractors.length >= 3) break
        const candKey = cand.term.trim().toLowerCase()
        if (!pickedKeys.has(candKey)) {
          pickedKeys.add(candKey)
          pickedDistractors.push(cand)
        }
      }
    }

    const correctOption: ClozeOption = { id: targetWord.id, term: targetWord.term }
    const shuffledOptions = shuffleArray([correctOption, ...pickedDistractors])
    const correctOptionIndex = shuffledOptions.findIndex(
      (opt) => opt.term.trim().toLowerCase() === targetKey
    )

    return {
      targetWord,
      sentence,
      sentenceBefore,
      sentenceAfter,
      matchedTerm,
      options: shuffledOptions,
      correctOptionIndex,
      repetitionCount: 0,
    }
  })

  return shuffleArray(questions)
}

export function ClozeView({
  words,
  allDeckWords,
  deckId,
  deckName,
  onBack,
}: ClozeViewProps) {
  const [questions, setQuestions] = useState<ClozeQuestion[]>(() =>
    buildClozeQuestions(words, allDeckWords)
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
  const [showHint, setShowHint] = useState(false)

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

  // Play audio for full sentence
  const handlePlaySentenceAudio = useCallback(async () => {
    if (!currentQ || isPlayingAudio) return
    setIsPlayingAudio(true)
    await audioService.speak(currentQ.sentence, 0.9)
    if (mountedRef.current) {
      setIsPlayingAudio(false)
    }
  }, [currentQ, isPlayingAudio])

  const handleSelect = useCallback(
    (index: number) => {
      if (isLocked || !currentQ) return

      setIsLocked(true)
      setSelectedOption(index)

      const isCorrect = index === currentQ.correctOptionIndex

      if (isCorrect) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(35)
          } catch {}
        }
        audioService.playSuccessChime()
        storageService.updateWordStatus(currentQ.targetWord.id, 'mastered')
        setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))

        // Auto read full sentence on correct completion for reinforcement
        void audioService.speak(currentQ.sentence, 0.95)
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
          const reshuffledOptions = shuffleArray(currentQ.options)
          const targetKey = currentQ.targetWord.term.trim().toLowerCase()
          setQuestions((prev) => [
            ...prev,
            {
              ...currentQ,
              options: reshuffledOptions,
              correctOptionIndex: reshuffledOptions.findIndex(
                (o) => o.term.trim().toLowerCase() === targetKey
              ),
              repetitionCount: currentQ.repetitionCount + 1,
            },
          ])
        }
      }

      clearTransitionTimer()
      transitionTimerRef.current = window.setTimeout(
        () => {
          if (!mountedRef.current) return
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((prev) => prev + 1)
            setSelectedOption(null)
            setIsLocked(false)
            setShowHint(false)
          } else {
            setIsCompleted(true)
          }
        },
        isCorrect ? 1500 : 2000
      )
    },
    [clearTransitionTimer, currentIndex, currentQ, isLocked, questions.length]
  )

  // Keyboard controls: 1-4 to pick option, Space for audio, Esc to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return

      if (e.key === 'Escape') {
        onBack()
        return
      }

      if (e.key === 'h' || e.key === 'H') {
        setShowHint((prev) => !prev)
        return
      }

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 4) {
        e.preventDefault()
        handleSelect(num - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSelect, isCompleted, onBack])

  if (isCompleted || !currentQ) {
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'cloze',
      deckName,
      remainingWords: storageService
        .getWords(deckId)
        .filter((w) => w.status !== 'mastered'),
    }

    return (
      <StudySummary
        stats={sessionStats}
        onContinueRemaining={(rem) => {
          setQuestions(buildClozeQuestions(rem, allDeckWords))
          setCurrentIndex(0)
          setSelectedOption(null)
          setIsLocked(false)
          setIsCompleted(false)
          setStats({ mastered: 0, review: 0 })
        }}
        onResetDeck={() => {
          void storageService.resetDeckProgress(deckId).then(() => {
            setQuestions(buildClozeQuestions(storageService.getWords(deckId), allDeckWords))
            setCurrentIndex(0)
            setSelectedOption(null)
            setIsLocked(false)
            setIsCompleted(false)
            setStats({ mastered: 0, review: 0 })
          })
        }}
        onBackToHome={onBack}
      />
    )
  }

  const isAnswered = selectedOption !== null
  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100)
  const isCorrectAnswer = selectedOption === currentQ.correctOptionIndex

  return (
    <div className="w-full max-w-md sm:max-w-lg mx-auto my-auto flex flex-col px-3.5 py-3 animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Quay lại (Esc)"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>Điền từ vào câu (Cloze)</span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Câu {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowHint((prev) => !prev)}
          className={`p-2 rounded-xl text-xs font-bold border transition-colors ${
            showHint
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
              : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
          }`}
          title="Xem gợi ý nghĩa (Phím H)"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mb-4">
        <div
          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Question Sentence Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700/70 shadow-xs mb-4 flex flex-col justify-between min-h-[170px] relative overflow-hidden">
        {/* Sentence Text with Blank */}
        <div className="space-y-3">
          <div className="text-base sm:text-lg font-medium text-slate-800 dark:text-slate-100 leading-relaxed">
            <span>{currentQ.sentenceBefore}</span>
            {isAnswered ? (
              <span
                className={`inline-block font-bold px-2 py-0.5 mx-1 rounded-lg transition-all ${
                  isCorrectAnswer
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 scale-105'
                    : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                }`}
              >
                {currentQ.matchedTerm}
              </span>
            ) : (
              <span className="inline-block px-3 py-0.5 mx-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-extrabold border-2 border-dashed border-indigo-400/60 tracking-wider">
                &nbsp;_____&nbsp;
              </span>
            )}
            <span>{currentQ.sentenceAfter}</span>
          </div>

          {/* Context Meaning Hint (Toggleable or auto shown on wrong) */}
          {(showHint || isAnswered) && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs animate-fadeIn">
              <span className="text-slate-400 block font-medium mb-0.5">
                Nghĩa của từ cần điền:
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {currentQ.targetWord.definition}
              </span>
              {currentQ.targetWord.ipa && (
                <span className="text-[11px] text-slate-400 ml-2 font-mono">
                  {currentQ.targetWord.ipa}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Audio Speaker Button */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60 mt-2">
          <span className="text-[11px] text-slate-400 font-medium">
            Chọn từ đúng nhất để hoàn chỉnh câu
          </span>
          <button
            type="button"
            onClick={handlePlaySentenceAudio}
            disabled={isPlayingAudio}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1 text-xs font-semibold"
            title="Nghe đọc cả câu"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlayingAudio ? 'animate-pulse text-indigo-500' : ''}`} />
            <span>Nghe câu</span>
          </button>
        </div>
      </div>

      {/* 4 Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {currentQ.options.map((opt, idx) => {
          let btnStyle =
            'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-750'
          let badgeStyle = 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'

          if (isAnswered) {
            if (idx === currentQ.correctOptionIndex) {
              btnStyle =
                'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold'
              badgeStyle = 'bg-emerald-500 text-white font-bold'
            } else if (idx === selectedOption) {
              btnStyle =
                'bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 font-bold'
              badgeStyle = 'bg-rose-500 text-white font-bold'
            } else {
              btnStyle = 'opacity-40 bg-slate-50 dark:bg-slate-800/40 border-transparent text-slate-400'
            }
          }

          return (
            <button
              key={`${currentQ.targetWord.id}-${opt.id}-${idx}`}
              type="button"
              disabled={isLocked}
              onClick={() => handleSelect(idx)}
              className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 shadow-2xs active:scale-98 ${btnStyle}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${badgeStyle}`}
                >
                  {idx + 1}
                </span>
                <span className="text-sm font-semibold truncate leading-tight">
                  {opt.term}
                </span>
              </div>

              {isAnswered && idx === currentQ.correctOptionIndex && (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              {isAnswered && idx === selectedOption && idx !== currentQ.correctOptionIndex && (
                <X className="w-4 h-4 text-rose-500 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom Footer Info */}
      <div className="mt-3 text-center">
        <span className="text-[11px] text-slate-400 font-medium">
          Mẹo: Chạm hoặc nhấn phím 1, 2, 3, 4 để chọn đáp án
        </span>
      </div>
    </div>
  )
}
