import {
  ArrowLeft,
  Check,
  FileText,
  Headphones,
  Sparkles,
  Star,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudyMode, StudySessionStats, WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { splitClozeSentence } from '../../utils/cloze'
import { normalizePartOfSpeech } from '../../utils/parser'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { StudySummary } from './StudySummary'

type SkillStage = 'en-vi' | 'listen' | 'vi-en' | 'cloze'

interface SmartMixViewProps {
  words: WordItem[]
  allDeckWords: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onSwitchStudyMode?: (nextMode: StudyMode, targetWords: WordItem[]) => void
  onBack: () => void
}

interface MixOption {
  label: string
  subLabel?: string
}

interface SmartMixQuestion {
  targetWord: WordItem
  stage: SkillStage
  options: MixOption[]
  correctOptionIndex: number
  sentenceBefore?: string
  sentenceAfter?: string
  matchedTerm?: string
  fullSentence?: string
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

function trySplitExample(
  sentence: string | undefined,
  term: string
): { sentenceBefore: string; sentenceAfter: string; matchedTerm: string } | null {
  if (!sentence || !sentence.trim()) return null
  const res = splitClozeSentence(sentence.trim(), term)
  if (res.isFallback) return null
  return {
    sentenceBefore: res.sentenceBefore,
    sentenceAfter: res.sentenceAfter,
    matchedTerm: res.matchedTerm,
  }
}

const STAGE_ROTATION: SkillStage[] = ['en-vi', 'listen', 'vi-en', 'cloze']

function buildSingleQuestion(
  targetWord: WordItem,
  desiredStage: SkillStage,
  candidates: WordItem[],
  repetitionCount: number
): SmartMixQuestion {
  const clozeSplit =
    desiredStage === 'cloze' ? trySplitExample(targetWord.example, targetWord.term) : null
  const actualStage: SkillStage =
    desiredStage === 'cloze' && !clozeSplit ? 'vi-en' : desiredStage

  const targetTermLower = targetWord.term.trim().toLowerCase()
  const targetDefLower = targetWord.definition.trim().toLowerCase()
  const targetPos = normalizePartOfSpeech(targetWord.partOfSpeech) || ''

  const eligible = candidates.filter(
    (c) =>
      c.term.trim().toLowerCase() !== targetTermLower &&
      c.definition.trim().toLowerCase() !== targetDefLower
  )

  const samePos = targetPos
    ? eligible.filter((c) => (normalizePartOfSpeech(c.partOfSpeech) || '') === targetPos)
    : []
  const primaryPool = samePos.length >= 3 ? samePos : eligible

  const sortedByLen = [...primaryPool].sort((a, b) => {
    const lenRef = actualStage === 'en-vi' ? targetWord.definition.length : targetWord.term.length
    const lenA = actualStage === 'en-vi' ? a.definition.length : a.term.length
    const lenB = actualStage === 'en-vi' ? b.definition.length : b.term.length
    return Math.abs(lenA - lenRef) - Math.abs(lenB - lenRef)
  })

  const sampled = shuffleArray(sortedByLen.slice(0, Math.min(8, sortedByLen.length)))
  const distractors: WordItem[] = []
  const usedKeys = new Set<string>([
    actualStage === 'en-vi' ? targetDefLower : targetTermLower,
  ])

  for (const cand of [...sampled, ...eligible]) {
    if (distractors.length >= 3) break
    const k =
      actualStage === 'en-vi'
        ? cand.definition.trim().toLowerCase()
        : cand.term.trim().toLowerCase()
    if (!usedKeys.has(k)) {
      usedKeys.add(k)
      distractors.push(cand)
    }
  }

  const toOption = (w: WordItem): MixOption => {
    if (actualStage === 'en-vi') {
      return { label: w.definition.trim() }
    }
    if (actualStage === 'listen') {
      return {
        label: w.term.trim(),
        subLabel: formatArcadeMeaning(w.definition, 68),
      }
    }
    return { label: w.term.trim() }
  }

  const rawOptions = [
    { item: targetWord, isCorrect: true },
    ...distractors.map((d) => ({ item: d, isCorrect: false })),
  ]
  const shuffled = shuffleArray(rawOptions)
  const correctOptionIndex = shuffled.findIndex((o) => o.isCorrect)

  return {
    targetWord,
    stage: actualStage,
    options: shuffled.map((o) => toOption(o.item)),
    correctOptionIndex,
    sentenceBefore: clozeSplit?.sentenceBefore,
    sentenceAfter: clozeSplit?.sentenceAfter,
    matchedTerm: clozeSplit?.matchedTerm,
    fullSentence: clozeSplit ? targetWord.example?.trim() : undefined,
    repetitionCount,
  }
}

function buildSmartMixQueue(sourceWords: WordItem[], fullDeckWords: WordItem[]): SmartMixQuestion[] {
  const rawPool =
    fullDeckWords.length >= 8
      ? [...fullDeckWords, ...sourceWords]
      : [...fullDeckWords, ...sourceWords, ...storageService.getWords().slice(0, 40)]

  const seen = new Set<string>()
  const uniqueCandidates: WordItem[] = []
  for (const w of rawPool) {
    const k = w.term.trim().toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      uniqueCandidates.push(w)
    }
  }

  return sourceWords.map((w, idx) => {
    const stage = STAGE_ROTATION[idx % STAGE_ROTATION.length]
    return buildSingleQuestion(w, stage, uniqueCandidates, 0)
  })
}

function VoiceAccentButton({ onToggle }: { onToggle?: () => void }) {
  const [voiceAccent, setVoiceAccent] = useState(() => audioService.getVoiceAccent())

  useEffect(() => {
    return audioService.subscribeAccent(() => {
      setVoiceAccent(audioService.getVoiceAccent())
    })
  }, [])

  return (
    <button
      type="button"
      onClick={() => {
        const next = audioService.toggleVoiceAccent()
        setVoiceAccent(next)
        audioService.playClick()
        onToggle?.()
      }}
      title="Đổi giọng đọc Anh-Mỹ (US) / Anh-Anh (UK)"
      className="min-h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-400 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap flex items-center justify-center active:scale-95 transition-all"
    >
      {voiceAccent === 'en-US' ? '🇺🇸 US' : '🇬🇧 UK'}
    </button>
  )
}

export function SmartMixView({
  words,
  allDeckWords,
  deckId,
  deckName,
  filterMode = 'all',
  onSwitchStudyMode,
  onBack,
}: SmartMixViewProps) {
  const [questions, setQuestions] = useState<SmartMixQuestion[]>(() =>
    buildSmartMixQueue(words, allDeckWords)
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
  const pendingAdvanceRef = useRef<(() => void) | null>(null)

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    pendingAdvanceRef.current = null
  }, [])

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  const flushPendingAdvance = useCallback(() => {
    const fn = pendingAdvanceRef.current
    if (!fn) return
    clearTransitionTimer()
    fn()
  }, [clearTransitionTimer])

  useEffect(() => {
    return () => {
      clearTransitionTimer()
      audioService.stopSpeech()
    }
  }, [clearTransitionTimer])

  const currentQ = questions[currentIndex]

  // Auto-speak ONLY on 'en-vi' and 'listen' stages so 'vi-en' & 'cloze' answers are never spoiled!
  useEffect(() => {
    if (!currentQ || isCompleted) return
    if (currentQ.stage === 'en-vi' || currentQ.stage === 'listen') {
      void audioService.speakAuto(currentQ.targetWord.term, 0.9)
    }
  }, [currentIndex, currentQ, isCompleted])

  const handleReplayAudio = useCallback(
    (rate = 0.9) => {
      if (!currentQ) return
      if (currentQ.stage === 'cloze') {
        const textToSpeak = isLocked
          ? currentQ.fullSentence || currentQ.targetWord.term
          : `${currentQ.sentenceBefore || ''} , ${currentQ.sentenceAfter || ''}`
        if (textToSpeak.trim()) {
          void audioService.speak(textToSpeak, rate)
        }
        return
      }
      if (currentQ.stage === 'vi-en' && !isLocked) return
      void audioService.speak(currentQ.targetWord.term, rate)
    },
    [currentQ, isLocked]
  )

  const handleSelect = useCallback(
    (index: number) => {
      if (isLocked || !currentQ) return
      setIsLocked(true)
      setSelectedOption(index)

      const isCorrect = index === currentQ.correctOptionIndex
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
        if (currentQ.stage === 'cloze' && currentQ.fullSentence) {
          void audioService.speakAuto(currentQ.fullSentence, 0.95)
        } else if (currentQ.stage === 'vi-en') {
          void audioService.speakAuto(currentQ.targetWord.term, 0.9)
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
        void audioService.speakAuto(currentQ.targetWord.term, 0.9)

        // Re-queue missed card in a DIFFERENT cognitive angle so learner truly masters it!
        if (currentQ.repetitionCount < 2) {
          wasRequeued = true
          const curStageIdx = STAGE_ROTATION.indexOf(currentQ.stage)
          const nextStage = STAGE_ROTATION[(curStageIdx + 2) % STAGE_ROTATION.length]
          const nextQ = buildSingleQuestion(
            currentQ.targetWord,
            nextStage,
            allDeckWords.length >= 6 ? allDeckWords : storageService.getWords().slice(0, 40),
            currentQ.repetitionCount + 1
          )
          setQuestions((prev) => [...prev, nextQ])
        }
      }

      const delay = isCorrect ? 950 : 1850
      const nextTotal = questions.length + (wasRequeued ? 1 : 0)

      clearTransitionTimer()
      const doAdvance = () => {
        transitionTimerRef.current = null
        pendingAdvanceRef.current = null
        if (currentIndex + 1 >= nextTotal) {
          setIsCompleted(true)
        } else {
          setCurrentIndex((prev) => prev + 1)
          setSelectedOption(null)
          setIsLocked(false)
        }
      }
      pendingAdvanceRef.current = doAdvance
      transitionTimerRef.current = window.setTimeout(doAdvance, delay)
    },
    [allDeckWords, clearTransitionTimer, currentIndex, currentQ, isLocked, questions.length]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || !currentQ) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }
      if (isLocked && (e.key === 'Enter' || e.key === 'ArrowRight') && !e.repeat) {
        e.preventDefault()
        flushPendingAdvance()
        return
      }
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
        handleReplayAudio(0.9)
        return
      }
      if (!isLocked && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < currentQ.options.length) {
          e.preventDefault()
          handleSelect(idx)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentQ, flushPendingAdvance, handleReplayAudio, handleSelect, isCompleted, isLocked, onBack])

  const resetMix = (nextWords: WordItem[]) => {
    clearTransitionTimer()
    const ordered =
      storageService.getStudyPreferences().shuffle && filterMode !== 'global-learning'
        ? shuffleArray(nextWords)
        : nextWords
    setQuestions(buildSmartMixQueue(ordered, allDeckWords))
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
      mode: 'smart-mix',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        sessionWords={words}
        onContinueRemaining={(rem) =>
          onSwitchStudyMode
            ? onSwitchStudyMode('smart-mix', rem)
            : resetMix(storageService.prepareStudyBatch(rem, filterMode))
        }
        onSwitchMode={onSwitchStudyMode}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  const resetPool = storageService.getWords(deckId)
                  if (onSwitchStudyMode) {
                    onSwitchStudyMode('smart-mix', resetPool)
                  } else {
                    resetMix(storageService.prepareStudyBatch(resetPool, filterMode))
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
  const isCorrectLocked = isLocked && selectedOption === currentQ.correctOptionIndex

  const stageMeta: Record<
    SkillStage,
    { badge: string; hint: string; colorClass: string }
  > = {
    'en-vi': {
      badge: 'Kỹ năng 1/4 • Nhận diện nghĩa',
      hint: 'Chọn nghĩa tiếng Việt chính xác',
      colorClass: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
    },
    listen: {
      badge: 'Kỹ năng 2/4 • Phản xạ nghe',
      hint: 'Nghe phát âm và chọn đúng từ',
      colorClass: 'bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/25',
    },
    'vi-en': {
      badge: 'Kỹ năng 3/4 • Nhớ từ chủ động',
      hint: 'Chọn từ tiếng Anh khớp với nghĩa',
      colorClass: 'bg-sky-500/12 text-sky-600 dark:text-sky-400 border-sky-500/25',
    },
    cloze: {
      badge: 'Kỹ năng 4/4 • Điền câu thực chiến',
      hint: 'Chọn từ phù hợp nhất với ngữ cảnh câu',
      colorClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25',
    },
  }

  const meta = stageMeta[currentQ.stage]

  return (
    <div
      className="w-full flex flex-col my-auto max-w-md sm:max-w-lg mx-auto px-3.5 py-2 select-none"
      onTouchStart={(e) => {
        if (!isLocked) return
        swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        if (!isLocked || !swipeStartRef.current || e.changedTouches.length === 0) return
        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x
        const dy = e.changedTouches[0].clientY - swipeStartRef.current.y
        swipeStartRef.current = null
        if (dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          flushPendingAdvance()
        }
      }}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          title="Quay lại (Esc)"
          className="w-9 h-9 -ml-1.5 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0 active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10.5px] font-extrabold text-indigo-600 dark:text-indigo-400 max-w-full">
            <Zap className="w-3 h-3 shrink-0 fill-current" />
            <span className="truncate">
              {filterMode !== 'all' ? deckName : 'Luyện Tổng Hợp Thông Minh'}
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Thử thách {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <VoiceAccentButton
            onToggle={() => {
              if (currentQ.stage === 'en-vi' || currentQ.stage === 'listen' || isLocked) {
                void audioService.speak(currentQ.targetWord.term, 0.9)
              }
            }}
          />
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
            title="Đánh dấu sao từ này (Phím S)"
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors shrink-0 active:scale-95 ${
              starredIds.has(currentQ.targetWord.id)
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
            }`}
          >
            <Star
              className={`w-4 h-4 ${starredIds.has(currentQ.targetWord.id) ? 'fill-amber-400' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3.5">
        <div
          className="bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Dynamic Multi-Skill Prompt Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 text-center border border-slate-200 dark:border-slate-800 shadow-sm mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.colorClass}`}
          >
            {meta.badge}
          </span>
          {currentQ.repetitionCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-600 dark:text-rose-400">
              Củng cố lại
            </span>
          )}
        </div>

        {/* Stage 1: EN -> VI */}
        {currentQ.stage === 'en-vi' && (
          <div className="py-2 space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleReplayAudio(0.9)}
                className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white break-words active:opacity-75 transition-opacity"
                title="Chạm vào từ để nghe phát âm"
              >
                {currentQ.targetWord.term}
              </button>
              <button
                type="button"
                onClick={() => handleReplayAudio(0.9)}
                className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                title="Nghe phát âm (Space)"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            {currentQ.targetWord.ipa && (
              <p className="text-xs font-mono text-slate-400">{currentQ.targetWord.ipa}</p>
            )}
          </div>
        )}

        {/* Stage 2: LISTEN -> Pick Term */}
        {currentQ.stage === 'listen' && (
          <div className="py-1 space-y-2.5">
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => handleReplayAudio(0.9)}
                className="w-15 h-15 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-md shadow-violet-500/25 active:scale-95 transition-transform"
                title="Nghe lại tốc độ chuẩn (Space)"
              >
                <Headphones className="w-7 h-7" />
              </button>
              <button
                type="button"
                onClick={() => handleReplayAudio(0.6)}
                className="h-11 px-3 rounded-xl bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 active:scale-95"
              >
                <Volume2 className="w-3.5 h-3.5 text-violet-500" />
                <span>Chậm 0.6x</span>
              </button>
            </div>
            {isLocked ? (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <div className="text-base font-extrabold text-slate-900 dark:text-white">
                  {currentQ.targetWord.term}{' '}
                  {currentQ.targetWord.ipa && (
                    <span className="text-xs font-mono text-violet-500 font-normal">
                      {currentQ.targetWord.ipa}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{meta.hint}</p>
            )}
          </div>
        )}

        {/* Stage 3: VI -> EN */}
        {currentQ.stage === 'vi-en' && (
          <div className="py-2 space-y-1.5">
            {currentQ.targetWord.partOfSpeech && (
              <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                {currentQ.targetWord.partOfSpeech}
              </span>
            )}
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-relaxed break-words">
              {currentQ.targetWord.definition}
            </p>
            {isLocked && currentQ.targetWord.ipa && (
              <p className="text-xs font-mono text-sky-500">{currentQ.targetWord.ipa}</p>
            )}
          </div>
        )}

        {/* Stage 4: CLOZE Sentence */}
        {currentQ.stage === 'cloze' && (
          <div className="py-1 text-left space-y-2.5">
            <div
              onClick={() => handleReplayAudio(0.9)}
              className="text-base font-medium text-slate-800 dark:text-slate-100 leading-relaxed cursor-pointer active:opacity-80"
            >
              <span>{currentQ.sentenceBefore}</span>
              {isLocked ? (
                <span
                  className={`inline-block font-bold px-2 py-0.5 mx-1 rounded-lg ${
                    isCorrectLocked
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {currentQ.matchedTerm || currentQ.targetWord.term}
                </span>
              ) : (
                <span className="inline-block px-2.5 py-0.5 mx-1 rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400 font-extrabold border-2 border-dashed border-amber-400/60">
                  &nbsp;_____&nbsp;
                </span>
              )}
              <span>{currentQ.sentenceAfter}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300 line-clamp-2">
                <Sparkles className="w-3 h-3 text-amber-500 inline mr-1" />
                {currentQ.targetWord.definition}
              </span>
              <button
                type="button"
                onClick={() => handleReplayAudio(0.9)}
                className="min-h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>{isLocked ? 'Nghe câu' : 'Ngữ cảnh'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4 Options List */}
      <div className="space-y-2.5">
        {currentQ.options.map((opt, idx) => {
          const isSelected = selectedOption === idx
          const isRight = idx === currentQ.correctOptionIndex
          let btnClass =
            'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-400'

          if (isLocked) {
            if (isRight) {
              btnClass =
                'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold'
            } else if (isSelected) {
              btnClass =
                'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-bold animate-shake'
            } else {
              btnClass = 'opacity-40 bg-slate-100 dark:bg-slate-800/40 border-transparent'
            }
          }

          return (
            <button
              key={`${currentIndex}-${idx}`}
              type="button"
              disabled={isLocked}
              onClick={() => handleSelect(idx)}
              className={`w-full py-3 px-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 shadow-2xs active:scale-98 ${btnClass}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug break-words">{opt.label}</div>
                  {opt.subLabel && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-normal">
                      {opt.subLabel}
                    </div>
                  )}
                </div>
              </div>
              {isLocked && isRight && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
              {isLocked && isSelected && !isRight && (
                <X className="w-4 h-4 text-rose-500 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Zero-Shift Touch Fast-Forward Slot */}
      <div className="h-9 mt-2.5 flex items-center justify-center">
        {isLocked ? (
          <button
            type="button"
            onClick={flushPendingAdvance}
            className="w-full h-9 rounded-xl bg-indigo-600/12 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-98 transition-all animate-fadeIn"
          >
            <span>Chạm để sang câu tiếp →</span>
          </button>
        ) : (
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Chạm đáp án để trả lời • Chạm loa hoặc câu để nghe phát âm
          </span>
        )}
      </div>
    </div>
  )
}

export default SmartMixView
