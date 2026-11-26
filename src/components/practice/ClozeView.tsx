import {
  ArrowLeft,
  Check,
  FileText,
  HelpCircle,
  Keyboard,
  ListChecks,
  Sparkles,
  Star,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudyMode, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { maskClozeSkeleton, normalizeClozeAttempt, splitClozeSentence } from '../../utils/cloze'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

const CLOZE_STYLE_KEY = 'vocabflow_cloze_style'
type ClozeStyle = 'choice' | 'typing'

interface ClozeViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onSwitchStudyMode?: (nextMode: StudyMode, targetWords: WordItem[]) => void
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

function buildClozeQuestions(
  sourceWords: WordItem[],
  fullDeckWords: WordItem[]
): ClozeQuestion[] {
  const poolSource =
    fullDeckWords.length >= 6
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 50)]

  interface ClozeCandidate {
    id: string
    term: string
    termKey: string
    defKey: string
    pos: string
  }

  const seenTerms = new Set<string>()
  const uniquePool: ClozeCandidate[] = []
  for (const w of poolSource) {
    const termKey = w.term.trim().toLowerCase()
    if (!seenTerms.has(termKey)) {
      seenTerms.add(termKey)
      uniquePool.push({
        id: w.id,
        term: w.term,
        termKey,
        defKey: w.definition.trim().toLowerCase(),
        pos: (w.partOfSpeech || '').trim().toLowerCase(),
      })
    }
  }

  const questions: ClozeQuestion[] = sourceWords.map((targetWord) => {
    const targetKey = targetWord.term.trim().toLowerCase()
    const targetDefKey = targetWord.definition.trim().toLowerCase()
    const targetPos = (targetWord.partOfSpeech || '').trim().toLowerCase()
    const sentence =
      targetWord.example?.trim() ||
      `${targetWord.term} plays a key role: ${targetWord.definition}.`

    const { sentenceBefore, sentenceAfter, matchedTerm } = splitClozeSentence(
      sentence,
      targetWord.term,
      targetWord.definition
    )

    const eligible = uniquePool.filter(
      (c) => c.termKey !== targetKey && c.defKey !== targetDefKey
    )
    const samePos = targetPos ? eligible.filter((c) => c.pos === targetPos) : []
    const primary = samePos.length >= 3 ? samePos : eligible
    const sortedByLen = [...primary].sort(
      (a, b) =>
        Math.abs(a.term.length - targetWord.term.length) -
        Math.abs(b.term.length - targetWord.term.length)
    )
    const topSlice = shuffleArray(sortedByLen.slice(0, Math.min(8, sortedByLen.length)))

    const pickedDistractors: ClozeOption[] = []
    const pickedKeys = new Set<string>([targetKey])

    for (const cand of [...topSlice, ...eligible]) {
      if (pickedDistractors.length >= 3) break
      if (!pickedKeys.has(cand.termKey)) {
        pickedKeys.add(cand.termKey)
        pickedDistractors.push({ id: cand.id, term: cand.term })
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

  return questions
}

export function ClozeView({
  words,
  allDeckWords,
  deckId,
  deckName,
  filterMode = 'all',
  onSwitchStudyMode,
  onBack,
}: ClozeViewProps) {
  const [questions, setQuestions] = useState<ClozeQuestion[]>(() =>
    buildClozeQuestions(words, allDeckWords)
  )
  const [clozeStyle, setClozeStyle] = useState<ClozeStyle>(() => {
    try {
      return window.localStorage.getItem(CLOZE_STYLE_KEY) === 'typing' ? 'typing' : 'choice'
    } catch {
      return 'choice'
    }
  })
  const [voiceAccent, setVoiceAccent] = useState(() => audioService.getVoiceAccent())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [typedInput, setTypedInput] = useState('')
  const [typingOutcome, setTypingOutcome] = useState<'none' | 'correct' | 'wrong'>('none')
  const [isLocked, setIsLocked] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [starredIds, setStarredIds] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.starred).map((w) => w.id))
  )

  const transitionTimerRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mountedRef = useRef(true)

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unsubAccent = audioService.subscribeAccent(() => {
      setVoiceAccent(audioService.getVoiceAccent())
    })
    return () => {
      mountedRef.current = false
      unsubAccent()
      clearTransitionTimer()
      audioService.stopSpeech()
    }
  }, [clearTransitionTimer])

  const currentQ = questions[currentIndex]

  useEffect(() => {
    if (clozeStyle === 'typing' && !isLocked && !isCompleted) {
      inputRef.current?.focus()
    }
  }, [clozeStyle, currentIndex, isLocked, isCompleted])

  // Play sentence audio WITHOUT spoiling the blank before answering!
  const handlePlaySentenceAudio = useCallback(async () => {
    if (!currentQ || isPlayingAudio) return
    setIsPlayingAudio(true)
    const isFallbackPrompt = currentQ.sentenceBefore.startsWith('Chọn từ/cụm từ')
    const textToSpeak = isLocked
      ? currentQ.sentence
      : isFallbackPrompt
      ? ''
      : `${currentQ.sentenceBefore} , ${currentQ.sentenceAfter}`
    if (textToSpeak.trim()) {
      await audioService.speak(textToSpeak, 0.9)
    }
    if (mountedRef.current) {
      setIsPlayingAudio(false)
    }
  }, [currentQ, isLocked, isPlayingAudio])

  const recordResultAndAdvance = useCallback(
    (isCorrect: boolean, delayOverrideMs?: number) => {
      if (!currentQ) return
      const isFirstAttempt = currentQ.repetitionCount === 0
      let wasRequeued = false

      if (isCorrect) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(35)
          } catch {}
        }
        audioService.playSuccessChime()
        if (isFirstAttempt) {
          storageService.updateWordStatus(currentQ.targetWord.id, 'mastered')
          setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
        } else {
          storageService.recordDailyActivity(true)
        }
        void audioService.speakAuto(currentQ.sentence, 0.95)
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 50, 80])
          } catch {}
        }
        audioService.playErrorBuzz()
        if (isFirstAttempt) {
          storageService.updateWordStatus(currentQ.targetWord.id, 'learning')
          setStats((prev) => ({ ...prev, review: prev.review + 1 }))
        }

        if (currentQ.repetitionCount < 2) {
          wasRequeued = true
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

      const nextTotal = questions.length + (wasRequeued ? 1 : 0)
      clearTransitionTimer()
      transitionTimerRef.current = window.setTimeout(
        () => {
          if (!mountedRef.current) return
          if (currentIndex + 1 < nextTotal) {
            setCurrentIndex((prev) => prev + 1)
            setSelectedOption(null)
            setTypedInput('')
            setTypingOutcome('none')
            setIsLocked(false)
            setShowHint(false)
          } else {
            setIsCompleted(true)
          }
        },
        delayOverrideMs ?? (isCorrect ? 1500 : 2100)
      )
    },
    [clearTransitionTimer, currentIndex, currentQ, questions.length]
  )

  const handleSelect = useCallback(
    (index: number) => {
      if (isLocked || !currentQ) return
      setIsLocked(true)
      setSelectedOption(index)
      recordResultAndAdvance(index === currentQ.correctOptionIndex)
    },
    [isLocked, currentQ, recordResultAndAdvance]
  )

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked || !currentQ) return
    const attempt = normalizeClozeAttempt(typedInput)
    if (!attempt) return

    const baseTarget = normalizeClozeAttempt(currentQ.targetWord.term)
    const inflectedTarget = normalizeClozeAttempt(currentQ.matchedTerm)
    const isCorrect = attempt === baseTarget || attempt === inflectedTarget

    setIsLocked(true)
    setTypingOutcome(isCorrect ? 'correct' : 'wrong')
    recordResultAndAdvance(isCorrect, isCorrect ? 1450 : 2250)
  }

  const handleRevealTypingAnswer = () => {
    if (isLocked || !currentQ) return
    setIsLocked(true)
    setTypingOutcome('wrong')
    void audioService.speakAuto(currentQ.sentence, 0.92)
    recordResultAndAdvance(false, 2350)
  }

  const handleSwitchClozeStyle = (nextStyle: ClozeStyle) => {
    if (nextStyle === clozeStyle || isLocked) return
    audioService.playClick()
    setClozeStyle(nextStyle)
    setTypedInput('')
    setTypingOutcome('none')
    setShowHint(false)
    try {
      window.localStorage.setItem(CLOZE_STYLE_KEY, nextStyle)
    } catch {}
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || !currentQ) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }

      const isTypingBox =
        typeof document !== 'undefined' && document.activeElement === inputRef.current
      if (isTypingBox) return

      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        audioService.playClick()
        const next = storageService.toggleWordStar(currentQ.targetWord.id)
        setStarredIds((prev) => {
          const copy = new Set(prev)
          if (next) copy.add(currentQ.targetWord.id)
          else copy.delete(currentQ.targetWord.id)
          return copy
        })
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        void handlePlaySentenceAudio()
        return
      }

      if (e.key === 'h' || e.key === 'H') {
        setShowHint((prev) => !prev)
        return
      }

      if (clozeStyle === 'choice') {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= 4) {
          e.preventDefault()
          handleSelect(num - 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clozeStyle, currentQ, handlePlaySentenceAudio, handleSelect, isCompleted, onBack])

  const resetClozeSession = (nextWords: WordItem[]) => {
    clearTransitionTimer()
    const ordered =
      storageService.getStudyPreferences().shuffle && filterMode !== 'global-learning'
        ? shuffleArray(nextWords)
        : nextWords
    setQuestions(buildClozeQuestions(ordered, allDeckWords))
    setCurrentIndex(0)
    setSelectedOption(null)
    setTypedInput('')
    setTypingOutcome('none')
    setIsLocked(false)
    setShowHint(false)
    setStats({ mastered: 0, review: 0 })
    setIsCompleted(false)
  }

  if (isCompleted || !currentQ) {
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'cloze',
      deckName,
      remainingWords: storageService.getRemainingWordsForSession(deckId, words, filterMode),
    }

    return (
      <StudySummary
        stats={sessionStats}
        sessionWords={words}
        onBackToHome={onBack}
        onContinueRemaining={(remaining) => resetClozeSession(remaining)}
        onSwitchMode={onSwitchStudyMode}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  resetClozeSession(storageService.getWords(deckId))
                })
              }
        }
      />
    )
  }

  const isAnswered = isLocked
  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100)
  const isCorrectAnswer =
    clozeStyle === 'choice'
      ? selectedOption === currentQ.correctOptionIndex
      : typingOutcome === 'correct'

  return (
    <div className="w-full max-w-md sm:max-w-lg mx-auto my-auto flex flex-col px-3.5 py-2.5 animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Quay lại (Esc)"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex flex-col items-center min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 max-w-full">
            <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">
              {filterMode !== 'all' ? deckName : 'Điền từ vào câu (Cloze)'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Câu {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
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
            className={`p-2 rounded-xl border transition-colors ${
              starredIds.has(currentQ.targetWord.id)
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
            }`}
            title="Đánh dấu sao từ này"
          >
            <Star
              className={`w-4 h-4 ${starredIds.has(currentQ.targetWord.id) ? 'fill-amber-400' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowHint((prev) => !prev)}
            className={`p-2 rounded-xl text-xs font-bold border transition-colors ${
              showHint
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
            }`}
            title="Xem gợi ý (Phím H)"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mb-3">
        <div
          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Mode Switcher (4 Đáp án vs Tự gõ từ) + US/UK Accent */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/70">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleSwitchClozeStyle('choice')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              clozeStyle === 'choice'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>4 Đáp án</span>
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleSwitchClozeStyle('typing')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              clozeStyle === 'typing'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Tự gõ từ</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = audioService.toggleVoiceAccent()
            setVoiceAccent(next)
            audioService.playClick()
          }}
          className="py-1.5 px-2.5 rounded-xl text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-indigo-400 whitespace-nowrap active:scale-95 transition-all"
          title="Đổi giọng đọc Anh-Mỹ (US) / Anh-Anh (UK)"
        >
          {voiceAccent === 'en-US' ? '🇺🇸 US' : '🇬🇧 UK'}
        </button>
      </div>

      {/* Question Sentence Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700/70 shadow-xs mb-3.5 flex flex-col justify-between min-h-[160px] relative overflow-hidden">
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

          {/* Meaning Clue (Always shown in Typing mode so exact synonym is unambiguous; toggleable in Choice mode) */}
          {(clozeStyle === 'typing' || showHint || isAnswered) && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs animate-fadeIn space-y-1">
              <div>
                <span className="text-slate-400 block font-medium mb-0.5">
                  Nghĩa của từ cần điền
                  {currentQ.targetWord.partOfSpeech
                    ? ` (${currentQ.targetWord.partOfSpeech})`
                    : ''}
                  :
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {currentQ.targetWord.definition}
                </span>
                {(isAnswered || (showHint && clozeStyle === 'choice')) &&
                  currentQ.targetWord.ipa && (
                    <span className="text-[11px] text-slate-400 ml-2 font-mono">
                      {currentQ.targetWord.ipa}
                    </span>
                  )}
              </div>

              {clozeStyle === 'typing' && showHint && !isAnswered && (
                <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60 font-mono text-xs font-extrabold text-amber-600 dark:text-amber-400 tracking-wider">
                  Gợi ý chữ: {maskClozeSkeleton(currentQ.targetWord.term)}
                  {currentQ.targetWord.ipa ? `  •  ${currentQ.targetWord.ipa}` : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Audio Speaker Button */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60 mt-2">
          <span className="text-[11px] text-slate-400 font-medium">
            {clozeStyle === 'typing'
              ? 'Gõ từ tiếng Anh phù hợp vào ô bên dưới'
              : 'Chọn từ đúng nhất để hoàn chỉnh câu'}
          </span>
          <button
            type="button"
            onClick={() => void handlePlaySentenceAudio()}
            disabled={isPlayingAudio}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1 text-xs font-semibold"
            title={isAnswered ? 'Nghe đọc cả câu hoàn chỉnh' : 'Nghe ngữ cảnh câu (đã ẩn từ trống)'}
          >
            <Volume2
              className={`w-3.5 h-3.5 ${isPlayingAudio ? 'animate-pulse text-indigo-500' : ''}`}
            />
            <span>{isAnswered ? 'Nghe cả câu' : 'Nghe ngữ cảnh'}</span>
          </button>
        </div>
      </div>

      {clozeStyle === 'choice' ? (
        <>
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
                  btnStyle =
                    'opacity-40 bg-slate-50 dark:bg-slate-800/40 border-transparent text-slate-400'
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
                  {isAnswered &&
                    idx === selectedOption &&
                    idx !== currentQ.correctOptionIndex && (
                      <X className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 text-center">
            <span className="text-[11px] text-slate-400 font-medium">
              Mẹo: Chạm hoặc nhấn phím 1, 2, 3, 4 để chọn đáp án
            </span>
          </div>
        </>
      ) : (
        /* Active Cloze Typing Form */
        <form
          onSubmit={handleTypingSubmit}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Điền từ tiếng Anh vào chỗ trống
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  audioService.playClick()
                  setShowHint((prev) => !prev)
                }}
                className="py-1 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>{showHint ? 'Ẩn chữ cái' : 'Gợi ý chữ'}</span>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={handleRevealTypingAnswer}
                className="py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 text-slate-500 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Xem đáp án và ôn lại câu này ở cuối lượt"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Đáp án</span>
              </button>
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            disabled={isLocked}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder="Nhập từ hoặc cụm từ tiếng Anh..."
            className={`w-full py-3 px-3.5 rounded-xl border text-base font-bold text-center transition-colors focus:outline-none focus:ring-2 ${
              typingOutcome === 'correct'
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 focus:ring-emerald-500'
                : typingOutcome === 'wrong'
                ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-300 animate-shake focus:ring-rose-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-indigo-500'
            }`}
          />

          {typingOutcome !== 'none' && (
            <div
              className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 animate-fadeIn ${
                typingOutcome === 'correct'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
              }`}
            >
              {typingOutcome === 'correct' ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Chính xác! "{currentQ.matchedTerm}" khớp hoàn hảo.</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4 shrink-0" />
                  <span>
                    Đáp án chuẩn:{' '}
                    <strong className="underline">{currentQ.targetWord.term}</strong>
                  </span>
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLocked || !typedInput.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Kiểm tra đáp án (Enter)</span>
          </button>
        </form>
      )}
    </div>
  )
}
