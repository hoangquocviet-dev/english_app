import {
  ArrowLeft,
  Check,
  Headphones,
  HelpCircle,
  Keyboard,
  Lightbulb,
  ListChecks,
  Star,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudyMode, StudySessionStats, WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { maskClozeSkeleton, normalizeClozeAttempt } from '../../utils/cloze'
import { normalizePartOfSpeech } from '../../utils/parser'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

const LISTENING_STYLE_KEY = 'vocabflow_listening_style'
type ListeningStyle = 'choice' | 'dictation'

interface ListeningViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onSwitchStudyMode?: (nextMode: StudyMode, targetWords: WordItem[]) => void
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

const normalizeDictation = normalizeClozeAttempt
const maskTermSkeleton = maskClozeSkeleton

function buildListeningQuestions(
  sourceWords: WordItem[],
  fullDeckWords: WordItem[]
): ListeningQuestion[] {
  const rawList =
    fullDeckWords.length >= 6
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 40)]

  const seenTerms = new Set<string>()
  const uniquePool: Array<ListeningOption & { termKey: string; defKey: string; pos: string }> = []
  for (const w of rawList) {
    const termKey = w.term.trim().toLowerCase()
    if (!seenTerms.has(termKey)) {
      seenTerms.add(termKey)
      uniquePool.push({
        id: w.id,
        term: w.term,
        definition: w.definition,
        termKey,
        defKey: w.definition.trim().toLowerCase(),
        pos: normalizePartOfSpeech(w.partOfSpeech) || '',
      })
    }
  }

  const generated: ListeningQuestion[] = sourceWords.map((targetWord) => {
    const targetKey = targetWord.term.trim().toLowerCase()
    const targetDefKey = targetWord.definition.trim().toLowerCase()
    const targetPos = normalizePartOfSpeech(targetWord.partOfSpeech) || ''

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

    const picked: ListeningOption[] = []
    const pickedKeys = new Set<string>([targetKey])

    for (const cand of [...topSlice, ...eligible]) {
      if (picked.length >= 3) break
      if (!pickedKeys.has(cand.termKey)) {
        pickedKeys.add(cand.termKey)
        picked.push({ id: cand.id, term: cand.term, definition: cand.definition })
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

  return generated
}

export function ListeningView({
  words,
  allDeckWords,
  deckId,
  deckName,
  filterMode = 'all',
  onSwitchStudyMode,
  onBack,
}: ListeningViewProps) {
  const [questions, setQuestions] = useState<ListeningQuestion[]>(() =>
    buildListeningQuestions(words, allDeckWords)
  )
  const [listeningStyle, setListeningStyle] = useState<ListeningStyle>(() => {
    try {
      return window.localStorage.getItem(LISTENING_STYLE_KEY) === 'dictation'
        ? 'dictation'
        : 'choice'
    } catch {
      return 'choice'
    }
  })
  const [voiceAccent, setVoiceAccent] = useState(() => audioService.getVoiceAccent())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [typedInput, setTypedInput] = useState('')
  const [dictationOutcome, setDictationOutcome] = useState<'none' | 'correct' | 'wrong'>('none')
  const [showDictationHint, setShowDictationHint] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [isCompleted, setIsCompleted] = useState(false)
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

  useEffect(() => {
    if (currentQ && !isCompleted) {
      void audioService.speakAuto(currentQ.targetWord.term, 0.9)
    }
  }, [currentIndex, currentQ, isCompleted])

  useEffect(() => {
    if (listeningStyle === 'dictation' && !isLocked && !isCompleted) {
      inputRef.current?.focus()
    }
  }, [listeningStyle, currentIndex, isLocked, isCompleted])

  const recordOutcomeAndAdvance = useCallback(
    (isCorrect: boolean, customDelayMs?: number) => {
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

      const delay = customDelayMs ?? (isCorrect ? 1000 : 1950)
      const nextTotal = questions.length + (wasRequeued ? 1 : 0)

      clearTransitionTimer()
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null
        if (!mountedRef.current) return
        if (currentIndex + 1 >= nextTotal) {
          setIsCompleted(true)
        } else {
          setCurrentIndex((prev) => prev + 1)
          setSelectedOption(null)
          setTypedInput('')
          setDictationOutcome('none')
          setShowDictationHint(false)
          setIsLocked(false)
        }
      }, delay)
    },
    [clearTransitionTimer, currentIndex, currentQ, questions.length]
  )

  const handleSelect = useCallback(
    (index: number) => {
      if (isLocked || !currentQ) return
      setIsLocked(true)
      setSelectedOption(index)
      recordOutcomeAndAdvance(index === currentQ.correctOptionIndex)
    },
    [isLocked, currentQ, recordOutcomeAndAdvance]
  )

  const handleDictationSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked || !currentQ) return
    const cleanAttempt = normalizeDictation(typedInput)
    if (!cleanAttempt) return

    const cleanTarget = normalizeDictation(currentQ.targetWord.term)
    const isCorrect = cleanAttempt === cleanTarget
    setIsLocked(true)
    setDictationOutcome(isCorrect ? 'correct' : 'wrong')
    recordOutcomeAndAdvance(isCorrect, isCorrect ? 1050 : 2200)
  }

  const handleRevealDictationAnswer = () => {
    if (isLocked || !currentQ) return
    setIsLocked(true)
    setDictationOutcome('wrong')
    void audioService.speak(currentQ.targetWord.term, 0.85)
    recordOutcomeAndAdvance(false, 2300)
  }

  const handleSwitchStyle = (nextStyle: ListeningStyle) => {
    if (nextStyle === listeningStyle || isLocked) return
    audioService.playClick()
    setListeningStyle(nextStyle)
    setTypedInput('')
    setDictationOutcome('none')
    setShowDictationHint(false)
    try {
      window.localStorage.setItem(LISTENING_STYLE_KEY, nextStyle)
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

      const isTypingInBox =
        typeof document !== 'undefined' && document.activeElement === inputRef.current

      if (!isTypingInBox && (e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
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

      if (e.code === 'Space' && !isTypingInBox) {
        e.preventDefault()
        void playAudio(0.9)
      } else if (
        listeningStyle === 'choice' &&
        !isLocked &&
        !isTypingInBox &&
        ['1', '2', '3', '4'].includes(e.key)
      ) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < currentQ.options.length) {
          handleSelect(idx)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [listeningStyle, isLocked, isCompleted, currentQ, playAudio, handleSelect, onBack])

  const resetListening = (sourceWords: WordItem[]) => {
    clearTransitionTimer()
    const ordered =
      storageService.getStudyPreferences().shuffle && filterMode !== 'global-learning'
        ? shuffleArray(sourceWords)
        : sourceWords
    setQuestions(buildListeningQuestions(ordered, allDeckWords))
    setCurrentIndex(0)
    setSelectedOption(null)
    setTypedInput('')
    setDictationOutcome('none')
    setShowDictationHint(false)
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
        sessionWords={words}
        onContinueRemaining={(rem) =>
          onSwitchStudyMode
            ? onSwitchStudyMode('listening', rem)
            : resetListening(storageService.prepareStudyBatch(rem, filterMode))
        }
        onSwitchMode={onSwitchStudyMode}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  const resetPool = storageService.getWords(deckId)
                  if (onSwitchStudyMode) {
                    onSwitchStudyMode('listening', resetPool)
                  } else {
                    resetListening(storageService.prepareStudyBatch(resetPool, filterMode))
                  }
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
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          title="Quay lại (Esc)"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center min-w-0">
          {filterMode !== 'all' && (
            <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 truncate max-w-[170px] leading-tight mb-0.5">
              {deckName}
            </span>
          )}
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

      {/* Mode Switcher (4 Đáp án vs Nghe gõ từ) + US/UK Accent */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/70">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleSwitchStyle('choice')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              listeningStyle === 'choice'
                ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>4 Đáp án</span>
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleSwitchStyle('dictation')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              listeningStyle === 'dictation'
                ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Nghe gõ từ</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = audioService.toggleVoiceAccent()
            setVoiceAccent(next)
            void playAudio(0.9)
          }}
          className="py-1.5 px-2.5 rounded-xl text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-violet-400 whitespace-nowrap active:scale-95 transition-all"
          title="Đổi giọng đọc Anh-Mỹ (US) / Anh-Anh (UK) và nghe lại"
        >
          {voiceAccent === 'en-US' ? '🇺🇸 US' : '🇬🇧 UK'}
        </button>
      </div>

      {/* Audio Prompt Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-4">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-3">
          {listeningStyle === 'dictation'
            ? 'Nghe kỹ phát âm và gõ lại từ tiếng Anh'
            : 'Lắng nghe phát âm và chọn từ đúng'}
        </span>

        <div className="flex items-center justify-center gap-3 my-2">
          <button
            type="button"
            onClick={() => void playAudio(0.9)}
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
            onClick={() => void playAudio(0.6)}
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
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">
              {currentQ.targetWord.definition}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Chạm vào biểu tượng tai nghe để nghe lại
          </p>
        )}
      </div>

      {listeningStyle === 'choice' ? (
        /* 4 Multiple-Choice Options */
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

                {isLocked && isCorrect && (
                  <Check className="w-5 h-5 text-emerald-500 shrink-0 ml-2" />
                )}
                {isLocked && isSelected && !isCorrect && (
                  <X className="w-5 h-5 text-rose-500 shrink-0 ml-2" />
                )}
              </button>
            )
          })}
        </div>
      ) : (
        /* Active Dictation (Type What You Hear) Panel */
        <form
          onSubmit={handleDictationSubmit}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Chép chính tả tiếng Anh
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  audioService.playClick()
                  setShowDictationHint((prev) => !prev)
                }}
                className="py-1 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <Lightbulb className="w-3 h-3" />
                <span>{showDictationHint ? 'Ẩn gợi ý' : 'Gợi ý'}</span>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={handleRevealDictationAnswer}
                className="py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 text-slate-500 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Xem đáp án và ôn lại từ này ở cuối lượt"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Đáp án</span>
              </button>
            </div>
          </div>

          {showDictationHint && !isLocked && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left space-y-1 animate-fadeIn">
              <div className="font-mono text-xs font-extrabold text-amber-700 dark:text-amber-300 tracking-wider">
                {maskTermSkeleton(currentQ.targetWord.term)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Nghĩa: <strong>{currentQ.targetWord.definition}</strong>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            disabled={isLocked}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder="Nhập từ tiếng Anh bạn nghe được..."
            className={`w-full py-3 px-3.5 rounded-xl border text-base font-bold text-center transition-colors focus:outline-none focus:ring-2 ${
              dictationOutcome === 'correct'
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 focus:ring-emerald-500'
                : dictationOutcome === 'wrong'
                ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-300 animate-shake focus:ring-rose-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-violet-500'
            }`}
          />

          {dictationOutcome !== 'none' && (
            <div
              className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 animate-fadeIn ${
                dictationOutcome === 'correct'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
              }`}
            >
              {dictationOutcome === 'correct' ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Chính xác tuyệt đối!</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4 shrink-0" />
                  <span>
                    Đáp án chuẩn: <strong className="underline">{currentQ.targetWord.term}</strong>
                  </span>
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLocked || !typedInput.trim()}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Kiểm tra chính tả (Enter)</span>
          </button>
        </form>
      )}
    </div>
  )
}
