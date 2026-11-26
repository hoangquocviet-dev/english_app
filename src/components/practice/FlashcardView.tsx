import {
  ArrowLeft,
  Check,
  Mic,
  Pause,
  Play,
  RotateCw,
  Star,
  Undo2,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyFilterMode, StudyMode, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { GLOBAL_SRS_DECK_ID, storageService } from '../../utils/storage'
import { useWakeLock } from '../../utils/useWakeLock'
import { StudySummary } from './StudySummary'

interface FlashcardViewProps {
  words: WordItem[]
  deckId: string
  deckName: string
  filterMode?: StudyFilterMode
  onSwitchStudyMode?: (nextMode: StudyMode, targetWords: WordItem[]) => void
  onBack: () => void
}

interface QueuedWord {
  word: WordItem
  repetitionCount: number
}

interface HistoryEntry {
  prevWord: WordItem
  action: 'mastered' | 'review'
  wasRequeued: boolean
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>
}

interface SpeechRecognitionInstanceLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function normalizeSpeechText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function scorePronunciation(
  targetTerm: string,
  candidates: string[]
): { bestTranscript: string; accuracy: number } {
  const normTarget = normalizeSpeechText(targetTerm)
  let bestScore = 0
  let bestTranscript = candidates[0] || ''

  for (const raw of candidates) {
    const normSpoken = normalizeSpeechText(raw)
    if (!normSpoken) continue
    if (normSpoken === normTarget || normSpoken.includes(normTarget)) {
      return { bestTranscript: raw.trim(), accuracy: 100 }
    }
    const maxLen = Math.max(normTarget.length, normSpoken.length, 1)
    const dist = levenshtein(normTarget, normSpoken)
    const pct = Math.max(0, Math.round((1 - dist / maxLen) * 100))
    if (pct > bestScore) {
      bestScore = pct
      bestTranscript = raw.trim()
    }
  }
  return { bestTranscript, accuracy: bestScore }
}

export function FlashcardView({
  words,
  deckId,
  deckName,
  filterMode = 'all',
  onSwitchStudyMode,
  onBack,
}: FlashcardViewProps) {
  const [queue, setQueue] = useState<QueuedWord[]>(() =>
    words.map((w) => ({ word: w, repetitionCount: 0 }))
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, review: 0 })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isCompleted, setIsCompleted] = useState(false)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [voiceAccent, setVoiceAccent] = useState(() => audioService.getVoiceAccent())
  const [starredIds, setStarredIds] = useState<Set<string>>(
    () => new Set(words.filter((w) => w.starred).map((w) => w.id))
  )

  // Voice shadowing state
  const [canUseSpeechRec] = useState(() => Boolean(getSpeechRecognitionCtor()))
  const [isListeningMic, setIsListeningMic] = useState(false)
  const [speechFeedback, setSpeechFeedback] = useState<{
    ok: boolean
    text: string
  } | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null)

  // Touch & mouse gesture state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const ignoreClickUntilRef = useRef(0)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const currentItem = queue[currentIndex]
  const currentWord = currentItem?.word
  const isCurrentStarred = Boolean(currentWord && starredIds.has(currentWord.id))

  const stopMic = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
    setIsListeningMic(false)
  }, [])

  useEffect(() => {
    const unsubAccent = audioService.subscribeAccent(() => {
      setVoiceAccent(audioService.getVoiceAccent())
    })
    const onVisChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        setIsAutoPlaying(false)
        stopMic()
        audioService.stopSpeech()
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      unsubAccent()
      document.removeEventListener('visibilitychange', onVisChange)
      stopMic()
      audioService.stopSpeech()
    }
  }, [stopMic])

  // Auto pronounce word on card appear when NOT in hands-free loop (hands-free orchestrates its own timing)
  useEffect(() => {
    if (currentWord && !isCompleted && !isAutoPlaying) {
      void audioService.speakAuto(currentWord.term)
    }
  }, [currentIndex, currentWord, isCompleted, isAutoPlaying])

  // Keep smartphone screen awake during Hands-Free Auto-Play (Screen Wake Lock API)
  useWakeLock(isAutoPlaying && !isCompleted)

  // Hands-Free Auto-Play Loop: Speak term -> Flip -> Speak example -> Next card
  useEffect(() => {
    if (!isAutoPlaying || isCompleted || !currentWord) return
    let cancelled = false
    const timers: number[] = []
    const waitMs = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, ms)
        timers.push(id)
      })

    void (async () => {
      setIsFlipped(false)
      await waitMs(220)
      if (cancelled) return
      await audioService.speak(currentWord.term, 0.9)
      if (cancelled) return
      await waitMs(1200)
      if (cancelled) return
      setIsFlipped(true)
      if (currentWord.example) {
        await waitMs(350)
        if (cancelled) return
        await audioService.speak(currentWord.example, 0.95)
      }
      if (cancelled) return
      await waitMs(1650)
      if (cancelled) return

      if (currentIndex + 1 < queue.length) {
        setSpeechFeedback(null)
        setIsFlipped(false)
        setCurrentIndex((prev) => prev + 1)
      } else {
        setIsAutoPlaying(false)
      }
    })()

    return () => {
      cancelled = true
      for (const id of timers) window.clearTimeout(id)
    }
  }, [isAutoPlaying, isCompleted, currentIndex, currentWord, queue.length])

  const handleToggleStar = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (!currentWord) return
      audioService.playClick()
      const next = storageService.toggleWordStar(currentWord.id)
      setStarredIds((prev) => {
        const copy = new Set(prev)
        if (next) copy.add(currentWord.id)
        else copy.delete(currentWord.id)
        return copy
      })
    },
    [currentWord]
  )

  const handleStartPronunciationCheck = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (!currentWord) return
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) return

      if (isListeningMic) {
        stopMic()
        return
      }

      setIsAutoPlaying(false)
      audioService.stopSpeech()
      setSpeechFeedback(null)

      try {
        const rec = new Ctor()
        rec.lang = audioService.getVoiceAccent()
        rec.interimResults = false
        rec.maxAlternatives = 3
        recognitionRef.current = rec
        setIsListeningMic(true)

        rec.onresult = (ev) => {
          const firstResult = ev.results?.[0]
          const transcripts: string[] = []
          if (firstResult) {
            for (let i = 0; i < firstResult.length; i++) {
              if (firstResult[i]?.transcript) transcripts.push(firstResult[i].transcript)
            }
          }
          const { bestTranscript, accuracy } = scorePronunciation(currentWord.term, transcripts)
          if (accuracy >= 82) {
            audioService.playSuccessChime()
            setSpeechFeedback({
              ok: true,
              text: `Chuẩn xác (${accuracy}%): "${bestTranscript}"`,
            })
          } else {
            audioService.playClick()
            setSpeechFeedback({
              ok: false,
              text: bestTranscript
                ? `Nghe thấy "${bestTranscript}" (${accuracy}%) — Thử đọc lại nhé!`
                : 'Chưa nghe rõ, hãy đọc gần mic hơn nhé!',
            })
          }
        }

        rec.onerror = () => {
          setIsListeningMic(false)
          setSpeechFeedback({
            ok: false,
            text: 'Không truy cập được Mic hoặc chưa nghe rõ âm thanh.',
          })
        }

        rec.onend = () => {
          setIsListeningMic(false)
          recognitionRef.current = null
        }

        rec.start()
      } catch {
        setIsListeningMic(false)
      }
    },
    [currentWord, isListeningMic, stopMic]
  )

  const handleFlip = useCallback(() => {
    audioService.playClick()
    setIsFlipped((prev) => !prev)
  }, [])

  const handleAction = useCallback(
    (action: 'mastered' | 'review') => {
      if (!currentWord || !currentItem || isCompleted) return
      setIsAutoPlaying(false)
      stopMic()
      setSpeechFeedback(null)

      const liveWord =
        storageService.getWords().find((w) => w.id === currentWord.id) || currentWord
      const prevWordSnapshot: WordItem = { ...liveWord }
      let wasRequeued = false

      if (action === 'mastered') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(25)
          } catch {}
        }
        audioService.playSuccessChime()
        storageService.updateWordStatus(currentWord.id, 'mastered')
        setStats((prev) => ({ ...prev, mastered: prev.mastered + 1 }))
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {}
        }
        audioService.playClick()
        storageService.updateWordStatus(currentWord.id, 'learning')
        setStats((prev) => ({ ...prev, review: prev.review + 1 }))

        if (currentItem.repetitionCount < 3) {
          wasRequeued = true
          setQueue((prev) => [
            ...prev,
            { word: currentWord, repetitionCount: currentItem.repetitionCount + 1 },
          ])
        }
      }

      setHistory((prev) => [
        ...prev,
        { prevWord: prevWordSnapshot, action, wasRequeued },
      ])

      setDragOffset({ x: 0, y: 0 })
      setIsDragging(false)

      const nextLength = queue.length + (wasRequeued ? 1 : 0)
      if (currentIndex + 1 >= nextLength) {
        setIsCompleted(true)
      } else {
        setCurrentIndex((prev) => prev + 1)
        setIsFlipped(false)
      }
    },
    [currentWord, currentItem, isCompleted, queue.length, currentIndex, stopMic]
  )

  const handleUndo = useCallback(() => {
    if (history.length === 0 || currentIndex === 0 || isCompleted) return
    setIsAutoPlaying(false)
    stopMic()
    setSpeechFeedback(null)

    const last = history[history.length - 1]
    audioService.playClick()

    storageService.updateWord(last.prevWord)

    setStats((prev) => ({
      mastered: last.action === 'mastered' ? Math.max(0, prev.mastered - 1) : prev.mastered,
      review: last.action === 'review' ? Math.max(0, prev.review - 1) : prev.review,
    }))

    if (last.wasRequeued) {
      setQueue((prev) => prev.slice(0, -1))
    }

    setHistory((prev) => prev.slice(0, -1))
    setCurrentIndex((prev) => Math.max(0, prev - 1))
    setIsFlipped(false)
  }, [history, currentIndex, isCompleted, stopMic])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsAutoPlaying(false)
        onBack()
      } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        setIsAutoPlaying(false)
        handleFlip()
      } else if (e.code === 'ArrowRight' || e.key === '2') {
        e.preventDefault()
        handleAction('mastered')
      } else if (e.code === 'ArrowLeft' || e.key === '1') {
        e.preventDefault()
        handleAction('review')
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handleToggleStar()
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        audioService.playClick()
        setIsAutoPlaying((prev) => !prev)
      } else if ((e.key === 'm' || e.key === 'M') && canUseSpeechRec) {
        e.preventDefault()
        handleStartPronunciationCheck()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isCompleted,
    canUseSpeechRec,
    handleFlip,
    handleAction,
    handleToggleStar,
    handleStartPronunciationCheck,
    handleUndo,
    onBack,
  ])

  const handleSpeak = (e: React.MouseEvent, rate: number = 0.9) => {
    e.stopPropagation()
    setIsAutoPlaying(false)
    if (currentWord) {
      void audioService.speak(currentWord.term, rate)
    }
  }

  const handleSpeakExample = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAutoPlaying(false)
    if (currentWord?.example) {
      void audioService.speak(currentWord.example, 0.9)
    }
  }

  // Touch & Mouse Drag Handlers (dragOffsetRef prevents sub-16ms fast flick drops before React re-renders)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const startDrag = (clientX: number, clientY: number, isTouch: boolean) => {
    if (
      isTouch &&
      (clientX < 24 || (typeof window !== 'undefined' && clientX > window.innerWidth - 24))
    ) {
      return
    }
    touchStartRef.current = { x: clientX, y: clientY }
    dragOffsetRef.current = { x: 0, y: 0 }
    setIsDragging(true)
  }

  const moveDrag = (clientX: number, clientY: number) => {
    if (!touchStartRef.current) return
    const next = {
      x: clientX - touchStartRef.current.x,
      y: clientY - touchStartRef.current.y,
    }
    dragOffsetRef.current = next
    setDragOffset(next)
  }

  const endDrag = () => {
    if (!touchStartRef.current) return
    const { x, y } = dragOffsetRef.current
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    const threshold = 56

    if (absX > 12 || absY > 12) {
      ignoreClickUntilRef.current = performance.now() + 360
    }

    if (absY > threshold && absY > absX * 1.2) {
      setIsAutoPlaying(false)
      handleFlip()
    } else if (x > threshold && absX > absY * 1.2) {
      handleAction('mastered')
    } else if (x < -threshold && absX > absY * 1.2) {
      handleAction('review')
    }

    dragOffsetRef.current = { x: 0, y: 0 }
    setDragOffset({ x: 0, y: 0 })
    setIsDragging(false)
    touchStartRef.current = null
  }

  const handleCardClick = () => {
    if (performance.now() < ignoreClickUntilRef.current) return
    setIsAutoPlaying(false)
    handleFlip()
  }

  const startSessionWithWords = (targetWords: WordItem[]) => {
    setIsAutoPlaying(false)
    setQueue(targetWords.map((w) => ({ word: w, repetitionCount: 0 })))
    setCurrentIndex(0)
    setStats({ mastered: 0, review: 0 })
    setHistory([])
    setIsFlipped(false)
    setIsCompleted(false)
  }

  if (isCompleted) {
    const remainingList = storageService.getRemainingWordsForSession(deckId, words, filterMode)
    const sessionStats: StudySessionStats = {
      totalWords: words.length,
      masteredCount: stats.mastered,
      reviewCount: stats.review,
      mode: 'flashcard',
      deckName,
      remainingWords: remainingList,
    }
    return (
      <StudySummary
        stats={sessionStats}
        sessionWords={words}
        onContinueRemaining={(rem) =>
          onSwitchStudyMode
            ? onSwitchStudyMode('flashcard', rem)
            : startSessionWithWords(storageService.prepareStudyBatch(rem, filterMode))
        }
        onSwitchMode={onSwitchStudyMode}
        onResetDeck={
          deckId === GLOBAL_SRS_DECK_ID || filterMode !== 'all'
            ? undefined
            : () => {
                void storageService.resetDeckProgress(deckId).then(() => {
                  const resetPool = storageService.getWords(deckId)
                  if (onSwitchStudyMode) {
                    onSwitchStudyMode('flashcard', resetPool)
                  } else {
                    startSessionWithWords(storageService.prepareStudyBatch(resetPool, filterMode))
                  }
                })
              }
        }
        onBackToHome={onBack}
      />
    )
  }

  if (!currentWord) return null

  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100)
  const rightSwipeOpacity = Math.min(1, Math.max(0, (dragOffset.x - 20) / 60))
  const leftSwipeOpacity = Math.min(1, Math.max(0, (-dragOffset.x - 20) / 60))

  return (
    <div className="w-full flex flex-col my-auto max-w-md mx-auto px-3.5 py-2 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-1 mb-3">
        <button
          onClick={() => {
            setIsAutoPlaying(false)
            onBack()
          }}
          title="Quay lại (Esc)"
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center min-w-0">
          {filterMode && filterMode !== 'all' && (
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[170px] leading-tight mb-0.5">
              {deckName}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Thẻ {currentIndex + 1} / {queue.length}
          </span>
          <div className="w-24 sm:w-28 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 -mr-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setIsAutoPlaying((prev) => !prev)
            }}
            title={
              isAutoPlaying
                ? 'Tạm dừng tự chạy (Phím A)'
                : 'Tự chạy rảnh tay: Tự đọc & lật thẻ liên tục (Phím A)'
            }
            className={`h-9 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors active:scale-95 ${
              isAutoPlaying
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'
            }`}
          >
            {isAutoPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>Dừng</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Tự chạy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => handleToggleStar(e)}
            title={isCurrentStarred ? 'Bỏ đánh dấu sao (Phím S)' : 'Đánh dấu sao từ quan trọng (Phím S)'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95 ${
              isCurrentStarred
                ? 'text-amber-500'
                : 'text-slate-400 hover:text-amber-500'
            }`}
          >
            <Star className={`w-4 h-4 ${isCurrentStarred ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Hoàn tác thẻ trước (Ctrl+Z)"
            className="w-8.5 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30 transition-colors active:scale-95"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setIsAutoPlaying(false)
              handleFlip()
            }}
            title="Lật thẻ (Space)"
            className="w-8.5 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors active:scale-95"
          >
            <RotateCw className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* 3D Flashcard Container */}
      <div
        className="flex-1 flex items-center justify-center perspective-1000 my-auto py-3 relative"
        onTouchStart={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button')) return
          startDrag(e.touches[0].clientX, e.touches[0].clientY, true)
        }}
        onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endDrag}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button')) return
          startDrag(e.clientX, e.clientY, false)
        }}
        onMouseMove={(e) => {
          if (e.buttons === 1) moveDrag(e.clientX, e.clientY)
        }}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          if (isDragging) endDrag()
        }}
        data-no-pull="true"
      >
        {/* Dynamic Swipe Stamps */}
        {rightSwipeOpacity > 0.05 && (
          <div
            style={{ opacity: rightSwipeOpacity }}
            className="absolute top-6 left-6 z-20 pointer-events-none px-3 py-1.5 rounded-xl border-2 border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-sm uppercase tracking-wider -rotate-12 shadow-sm"
          >
            Đã thuộc
          </div>
        )}
        {leftSwipeOpacity > 0.05 && (
          <div
            style={{ opacity: leftSwipeOpacity }}
            className="absolute top-6 right-6 z-20 pointer-events-none px-3 py-1.5 rounded-xl border-2 border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold text-sm uppercase tracking-wider rotate-12 shadow-sm"
          >
            Ôn lại
          </div>
        )}

        <div
          onClick={handleCardClick}
          data-no-pull="true"
          data-testid="flashcard-3d"
          style={{
            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotateX(${
              isFlipped ? 180 : 0
            }deg) rotateZ(${dragOffset.x * 0.05}deg)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
          }}
          className="relative w-full max-w-sm h-80 sm:h-96 rounded-3xl cursor-pointer shadow-xl border border-slate-200/80 dark:border-slate-800"
        >
          {/* FRONT CARD */}
          <div
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'rotateX(0deg)',
              WebkitTransform: 'rotateX(0deg)',
            }}
            className="absolute inset-0 rounded-3xl bg-white dark:bg-slate-800 p-6 flex flex-col justify-between items-center text-center shadow-xs select-none"
          >
            <div className="w-full flex justify-between items-center gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {currentWord.partOfSpeech && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    {currentWord.partOfSpeech}
                  </span>
                )}
                {currentWord.status === 'mastered' && currentWord.srsLevel ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                    SRS Lv.{currentWord.srsLevel}
                  </span>
                ) : currentWord.status === 'learning' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    Đang ôn
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {canUseSpeechRec && (
                  <button
                    type="button"
                    onClick={handleStartPronunciationCheck}
                    className={`h-9 px-3 rounded-full text-[11px] font-bold flex items-center gap-1 transition-transform active:scale-95 ${
                      isListeningMic
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                    title="Luyện phát âm qua Mic (Phím M)"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{isListeningMic ? 'Nghe...' : 'Đọc thử'}</span>
                  </button>
                )}

                <button
                  onClick={(e) => handleSpeak(e, 0.6)}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Nghe chậm (0.6x)"
                >
                  0.6x
                </button>
                <button
                  onClick={(e) => handleSpeak(e, 0.9)}
                  className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Phát âm chuẩn"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="my-auto px-2 space-y-2">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words">
                {currentWord.term}
              </h2>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {currentWord.ipa && (
                  <p className="text-sm font-sans font-medium tracking-wide text-slate-400 dark:text-slate-500">
                    {currentWord.ipa}
                  </p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAutoPlaying(false)
                    const next = audioService.toggleVoiceAccent()
                    setVoiceAccent(next)
                    audioService.playClick()
                    void audioService.speak(currentWord.term, 0.9)
                  }}
                  title="Đổi giọng đọc Anh-Mỹ (US) / Anh-Anh (UK)"
                  className="min-h-8 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700/70 hover:bg-indigo-500/15 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center transition-all active:scale-95"
                >
                  {voiceAccent === 'en-US' ? '🇺🇸 US' : '🇬🇧 UK'}
                </button>
              </div>

              {speechFeedback && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold animate-fadeIn ${
                    speechFeedback.ok
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {speechFeedback.ok && <Check className="w-3.5 h-3.5 shrink-0" />}
                  <span>{speechFeedback.text}</span>
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
              <span>
                {isAutoPlaying
                  ? 'Đang tự động đọc & lật thẻ...'
                  : 'Vuốt LÊN / XUỐNG hoặc chạm để xem nghĩa'}
              </span>
            </div>
          </div>

          {/* BACK CARD */}
          <div
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'rotateX(180deg)',
              WebkitTransform: 'rotateX(180deg)',
            }}
            className="absolute inset-0 rounded-3xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-6 flex flex-col justify-between items-center text-center border-2 border-indigo-500/30 shadow-xs select-none"
          >
            <div className="w-full flex justify-between items-center">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Giải nghĩa
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAutoPlaying(false)
                    const next = audioService.toggleVoiceAccent()
                    setVoiceAccent(next)
                    audioService.playClick()
                    void audioService.speak(currentWord.term, 0.9)
                  }}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Đổi giọng đọc Anh-Mỹ (US) / Anh-Anh (UK)"
                >
                  {voiceAccent === 'en-US' ? '🇺🇸 US' : '🇬🇧 UK'}
                </button>
                <button
                  onClick={(e) => handleSpeak(e, 0.6)}
                  className="h-9 px-2.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Nghe chậm (0.6x)"
                >
                  0.6x
                </button>
                <button
                  onClick={(e) => handleSpeak(e, 0.9)}
                  className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title="Phát âm chuẩn"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="my-auto space-y-3 px-1 w-full max-h-64 overflow-y-auto">
              <div
                className={`font-bold text-slate-900 dark:text-slate-100 leading-snug break-words ${
                  currentWord.definition.length > 125 ? 'text-base sm:text-lg' : 'text-xl'
                }`}
              >
                {currentWord.definition}
              </div>

              {currentWord.example && (
                <button
                  type="button"
                  onClick={handleSpeakExample}
                  title="Chạm để nghe đọc cả câu ví dụ"
                  className="w-full p-3 rounded-xl bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-xs italic text-slate-700 dark:text-slate-200 leading-relaxed text-left border-l-4 border-indigo-500 flex items-start justify-between gap-2 transition-colors"
                >
                  <span>"{currentWord.example}"</span>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Vuốt Trái: Ôn lại | Vuốt Phải: Đã thuộc
            </div>
          </div>
        </div>
      </div>

      {/* Thumb-Friendly Bottom Action Bar (1-Handed Swipe + Center Undo) */}
      <div className="flex items-center gap-2 sm:gap-2.5 pt-3 pb-1">
        <button
          type="button"
          onClick={() => handleAction('review')}
          className="flex-1 min-h-12 py-3 px-3 rounded-2xl bg-amber-500/12 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 font-bold text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <X className="w-4.5 h-4.5 shrink-0" />
          <span>Chưa nhớ</span>
        </button>

        <button
          type="button"
          onClick={handleUndo}
          disabled={history.length === 0}
          aria-label="Hoàn tác thẻ trước"
          title="Hoàn tác thẻ vừa vuốt"
          className="min-h-12 w-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 disabled:opacity-30 flex items-center justify-center shrink-0 shadow-2xs active:scale-92 transition-all"
        >
          <Undo2 className="w-4.5 h-4.5" />
        </button>

        <button
          type="button"
          onClick={() => handleAction('mastered')}
          className="flex-1 min-h-12 py-3 px-3 rounded-2xl bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-bold text-xs sm:text-sm whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Check className="w-4.5 h-4.5 shrink-0" />
          <span>Đã thuộc</span>
        </button>
      </div>
    </div>
  )
}
