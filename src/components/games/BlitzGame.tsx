import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Check,
  Flame,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface BlitzGameProps {
  words: WordItem[]
  deckName: string
  onStudyMissedWords?: (words: WordItem[]) => void
  onBack: () => void
}

interface BlitzPrompt {
  word: WordItem
  shownDefinition: string
  isMatch: boolean
  durationMs: number
}

function getDurationForRound(round: number, defLength: number): number {
  let base = 1950
  if (round <= 2) base = 2900
  else if (round <= 6) base = 2550
  else if (round <= 14) base = 2250
  else if (round <= 24) base = 2050

  const lengthBonus = defLength > 48 ? 420 : 0
  return base + lengthBonus
}

function buildBlitzPool(words: WordItem[]): WordItem[] {
  const normalized = words
    .filter((w) => w.term.length <= 32)
    .map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 90) }))
  const base =
    normalized.length >= 6
      ? normalized
      : words.map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 90) }))

  const unique: WordItem[] = []
  const seen = new Set<string>()
  for (const w of base) {
    const tk = w.term.trim().toLowerCase()
    if (!seen.has(tk)) {
      seen.add(tk)
      unique.push(w)
    }
  }

  if (unique.length >= 8) return unique

  for (const iw of storageService.getWords()) {
    if (iw.term.length > 28) continue
    const formatted = { ...iw, definition: formatArcadeMeaning(iw.definition, 90) }
    const tk = formatted.term.trim().toLowerCase()
    if (!seen.has(tk)) {
      seen.add(tk)
      unique.push(formatted)
    }
    if (unique.length >= 18) break
  }
  return unique
}

function createBlitzPrompt(
  pool: WordItem[],
  roundNum: number,
  prevWordId?: string,
  forcedMatch?: boolean
): BlitzPrompt {
  const candidates = pool.filter((w) => w.id !== prevWordId)
  const sourceList = candidates.length > 0 ? candidates : pool
  const word = sourceList[Math.floor(Math.random() * sourceList.length)]
  const isMatch = typeof forcedMatch === 'boolean' ? forcedMatch : Math.random() < 0.5
  let shownDefinition = word.definition

  if (!isMatch) {
    const traps = pool.filter(
      (w) =>
        w.term.trim().toLowerCase() !== word.term.trim().toLowerCase() &&
        w.definition.trim().toLowerCase() !== word.definition.trim().toLowerCase()
    )
    if (traps.length > 0) {
      const samePos = word.partOfSpeech
        ? traps.filter((t) => t.partOfSpeech === word.partOfSpeech)
        : []
      const trapCandidates = samePos.length >= 2 ? samePos : traps
      const sortedByLen = [...trapCandidates].sort(
        (a, b) =>
          Math.abs(a.definition.length - word.definition.length) -
          Math.abs(b.definition.length - word.definition.length)
      )
      const topSlice = sortedByLen.slice(0, Math.min(5, sortedByLen.length))
      const trapWord = topSlice[Math.floor(Math.random() * topSlice.length)]
      shownDefinition = trapWord.definition
    } else {
      return {
        word,
        shownDefinition: word.definition,
        isMatch: true,
        durationMs: getDurationForRound(roundNum, word.definition.length),
      }
    }
  }

  return {
    word,
    shownDefinition,
    isMatch,
    durationMs: getDurationForRound(roundNum, shownDefinition.length),
  }
}

export function BlitzGame({ words, deckName, onStudyMissedWords, onBack }: BlitzGameProps) {
  const getPool = useCallback(() => buildBlitzPool(words), [words])
  const recentPolarityRef = useRef<boolean[]>([])

  const generatePrompt = useCallback(
    (roundNum: number, prevWordId?: string): BlitzPrompt => {
      const hist = recentPolarityRef.current
      let isMatch = Math.random() < 0.5
      if (hist.length >= 3 && hist.slice(-3).every((v) => v === isMatch)) {
        isMatch = !isMatch
      }
      const next = createBlitzPrompt(getPool(), roundNum, prevWordId, isMatch)
      recentPolarityRef.current = [...hist.slice(-4), next.isMatch]
      return next
    },
    [getPool]
  )

  const [prompt, setPrompt] = useState<BlitzPrompt>(() =>
    createBlitzPrompt(buildBlitzPool(words), 1)
  )
  const [round, setRound] = useState(1)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [correctTotal, setCorrectTotal] = useState(0)
  const [lives, setLives] = useState(3)
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'wrong' | 'timeout'>('none')
  const [missedWords, setMissedWords] = useState<WordItem[]>([])
  const [lastPointsPop, setLastPointsPop] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Number((prompt.durationMs / 1000).toFixed(1))
  )
  const [isUrgentText, setIsUrgentText] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['blitz-2s'] || 0
  )

  // Swipe gesture state for Tinder-style left/right reflex swipes
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const barRef = useRef<HTMLDivElement | null>(null)
  const progressPctRef = useRef(100)
  const remainingMsRef = useRef(prompt.durationMs)
  const lastTenthsRef = useRef(Math.round(prompt.durationMs / 100))
  const tickedFinalRef = useRef(false)
  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const lockedRef = useRef(false)
  const feedbackTimeoutRef = useRef<number | null>(null)

  const clearFeedbackTimeout = useCallback(() => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }, [])

  const applyBarVisual = useCallback((pct: number) => {
    progressPctRef.current = pct
    const el = barRef.current
    if (!el) return
    el.style.width = `${pct}%`
    const colorClass =
      pct <= 35
        ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]'
        : pct <= 65
        ? 'bg-amber-500'
        : 'bg-emerald-500'
    el.className = `h-full rounded-full ${colorClass}`
  }, [])

  const endGame = useCallback(
    (finalScore: number) => {
      clearFeedbackTimeout()
      setIsPaused(false)
      setIsGameOver(true)
      const isNew = storageService.saveHighScore('blitz-2s', finalScore)
      setIsNewRecord(isNew)
      setBestScore(storageService.getHighScores()['blitz-2s'] || finalScore)
      if (isNew && finalScore > 0) {
        audioService.playSuccessChime()
        try {
          confetti({ particleCount: 65, spread: 70, origin: { y: 0.6 } })
        } catch {}
      }
    },
    [clearFeedbackTimeout]
  )

  const advanceNextRound = useCallback(
    (nextRoundNum: number, prevId: string) => {
      const nextP = generatePrompt(nextRoundNum, prevId)
      remainingMsRef.current = nextP.durationMs
      const tenths = Math.round(nextP.durationMs / 100)
      lastTenthsRef.current = tenths
      tickedFinalRef.current = false

      setDragX(0)
      setIsDragging(false)
      setPrompt(nextP)
      setRound(nextRoundNum)
      setFeedback('none')
      setLastPointsPop(null)
      setIsUrgentText(false)
      setSecondsLeft(tenths / 10)
      applyBarVisual(100)
      lockedRef.current = false
    },
    [applyBarVisual, generatePrompt]
  )

  const handleTimeout = useCallback(() => {
    if (lockedRef.current || isGameOver) return
    lockedRef.current = true
    applyBarVisual(0)
    setSecondsLeft(0)
    setDragX(0)

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([80, 40, 80])
      } catch {}
    }
    audioService.playErrorBuzz()
    setFeedback('timeout')
    setStreak(0)
    setMissedWords((prev) =>
      prev.some((w) => w.id === prompt.word.id) ? prev : [...prev.slice(-3), prompt.word]
    )
    if (prompt.word.status === 'new') {
      storageService.updateWordStatus(prompt.word.id, 'learning', false)
    }

    const nextLives = livesRef.current - 1
    livesRef.current = nextLives
    setLives(nextLives)

    clearFeedbackTimeout()
    feedbackTimeoutRef.current = window.setTimeout(() => {
      feedbackTimeoutRef.current = null
      if (nextLives <= 0) {
        endGame(scoreRef.current)
      } else {
        advanceNextRound(round + 1, prompt.word.id)
      }
    }, 680)
  }, [isGameOver, round, prompt.word, applyBarVisual, clearFeedbackTimeout, endGame, advanceNextRound])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !isGameOver && !lockedRef.current) {
        setIsPaused(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearFeedbackTimeout()
    }
  }, [isGameOver, clearFeedbackTimeout])

  // 60fps Timer Bar Loop
  useEffect(() => {
    if (isGameOver || isPaused) return

    let rafId = 0
    let lastNow = performance.now()

    const tick = (now: number) => {
      const dtMs = Math.min(50, now - lastNow)
      lastNow = now

      if (!lockedRef.current) {
        remainingMsRef.current = Math.max(0, remainingMsRef.current - dtMs)
        const pct = (remainingMsRef.current / prompt.durationMs) * 100
        applyBarVisual(pct)

        if (remainingMsRef.current <= 750 && !tickedFinalRef.current && remainingMsRef.current > 0) {
          tickedFinalRef.current = true
          audioService.playCountdownTick()
        }

        const tenths = Math.ceil(remainingMsRef.current / 100)
        if (tenths !== lastTenthsRef.current) {
          lastTenthsRef.current = tenths
          setSecondsLeft(tenths / 10)
          setIsUrgentText(pct <= 35)
        }

        if (remainingMsRef.current <= 0) {
          handleTimeout()
          return
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [prompt, isGameOver, isPaused, applyBarVisual, handleTimeout])

  const handleAnswer = useCallback(
    (userSaysMatch: boolean) => {
      if (lockedRef.current || isGameOver || isPaused) return
      lockedRef.current = true
      setDragX(0)
      setIsDragging(false)

      const isRight = userSaysMatch === prompt.isMatch

      if (isRight) {
        const nextStreak = streak + 1
        const mult = nextStreak >= 10 ? 3 : nextStreak >= 5 ? 2 : 1
        const timeBonus = Math.round((progressPctRef.current / 100) * 35)
        let gained = (50 + timeBonus) * mult
        let popLabel = mult > 1 ? `+${gained} (x${mult})` : `+${gained}`

        // Every 10 consecutive streak restores +1 Heart (or awards +150 Perfect Bonus!)
        if (nextStreak % 10 === 0) {
          audioService.playPowerup()
          if (livesRef.current < 3) {
            livesRef.current += 1
            setLives(livesRef.current)
            popLabel = `🔥 CHUỖI ${nextStreak}! +1 ❤️`
          } else {
            gained += 150
            popLabel = `🔥 CHUỖI ${nextStreak}! +${gained}`
          }
        } else {
          audioService.playCombo(nextStreak)
        }

        scoreRef.current += gained
        setScore(scoreRef.current)
        setStreak(nextStreak)
        setMaxStreak((prev) => Math.max(prev, nextStreak))
        setCorrectTotal((prev) => prev + 1)
        setFeedback('correct')
        setLastPointsPop(popLabel)

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(20)
          } catch {}
        }
        storageService.recordDailyActivity(true)

        clearFeedbackTimeout()
        feedbackTimeoutRef.current = window.setTimeout(() => {
          feedbackTimeoutRef.current = null
          advanceNextRound(round + 1, prompt.word.id)
        }, 210)
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 40, 80])
          } catch {}
        }
        audioService.playErrorBuzz()
        setFeedback('wrong')
        setStreak(0)
        setMissedWords((prev) =>
          prev.some((w) => w.id === prompt.word.id) ? prev : [...prev.slice(-3), prompt.word]
        )
        if (prompt.word.status === 'new') {
          storageService.updateWordStatus(prompt.word.id, 'learning', false)
        }

        const nextLives = livesRef.current - 1
        livesRef.current = nextLives
        setLives(nextLives)

        clearFeedbackTimeout()
        feedbackTimeoutRef.current = window.setTimeout(() => {
          feedbackTimeoutRef.current = null
          if (nextLives <= 0) {
            endGame(scoreRef.current)
          } else {
            advanceNextRound(round + 1, prompt.word.id)
          }
        }, 650)
      }
    },
    [isGameOver, isPaused, prompt, streak, round, clearFeedbackTimeout, advanceNextRound, endGame]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isGameOver) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (!lockedRef.current) {
          e.preventDefault()
          setIsPaused((p) => !p)
        }
        return
      }
      if (isPaused || lockedRef.current) return
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' || e.key === '1') {
        e.preventDefault()
        handleAnswer(false)
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd' || e.key === '2') {
        e.preventDefault()
        handleAnswer(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isGameOver, isPaused, handleAnswer])

  const restartBlitz = () => {
    audioService.playClick()
    clearFeedbackTimeout()
    scoreRef.current = 0
    livesRef.current = 3
    lockedRef.current = false
    recentPolarityRef.current = []

    const first = generatePrompt(1)
    remainingMsRef.current = first.durationMs
    lastTenthsRef.current = Math.round(first.durationMs / 100)
    tickedFinalRef.current = false

    setScore(0)
    setLives(3)
    setStreak(0)
    setMaxStreak(0)
    setCorrectTotal(0)
    setMissedWords([])
    setIsNewRecord(false)
    setIsPaused(false)
    setIsGameOver(false)
    setPrompt(first)
    setRound(1)
    setFeedback('none')
    setLastPointsPop(null)
    setDragX(0)
    setIsUrgentText(false)
    setSecondsLeft(Number((first.durationMs / 1000).toFixed(1)))
    applyBarVisual(100)
  }

  const onPointerDown = (clientX: number, clientY: number) => {
    if (lockedRef.current || isPaused || isGameOver) return
    swipeStartRef.current = { x: clientX, y: clientY }
    setIsDragging(true)
  }

  const onPointerMove = (clientX: number) => {
    if (!swipeStartRef.current || lockedRef.current) return
    setDragX(clientX - swipeStartRef.current.x)
  }

  const onPointerEnd = () => {
    if (!swipeStartRef.current) return
    swipeStartRef.current = null
    setIsDragging(false)
    if (dragX <= -65) {
      handleAnswer(false)
    } else if (dragX >= 65) {
      handleAnswer(true)
    } else {
      setDragX(0)
    }
  }

  const isFever = streak >= 5
  const multBadge = streak >= 10 ? 'OVERDRIVE x3' : streak >= 5 ? 'FEVER x2' : `Chuỗi ${streak}`
  const rightStampOpacity = Math.min(1, Math.max(0, (dragX - 20) / 50))
  const leftStampOpacity = Math.min(1, Math.max(0, (-dragX - 20) / 50))

  return (
    <div
      className="w-full max-w-md mx-auto my-auto px-3.5 py-2 flex flex-col select-none relative"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            title="Thoát trò chơi"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {!isGameOver && (
            <button
              type="button"
              onClick={() => {
                if (lockedRef.current) return
                audioService.playClick()
                setIsPaused((p) => !p)
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
              title={isPaused ? 'Tiếp tục (P)' : 'Tạm dừng (P)'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
            {score.toLocaleString()} đ
          </span>
          {streak >= 2 && (
            <span
              className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                isFever
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-xs'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{multBadge}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {[1, 2, 3].map((h) => (
            <Heart
              key={h}
              className={`w-4 h-4 transition-all ${
                h <= lives
                  ? 'fill-rose-500 text-rose-500 scale-100'
                  : 'text-slate-300 dark:text-slate-700 scale-90'
              }`}
            />
          ))}
        </div>
      </div>

      {!isGameOver ? (
        <div className="flex flex-col relative">
          {/* Urgent Countdown Bar */}
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 px-1 gap-2">
            <span className="text-slate-400 uppercase tracking-wider text-[11px] truncate">
              Câu {round} • {deckName}
            </span>
            <span
              className={`tabular-nums ${
                isUrgentText
                  ? 'text-rose-500 font-extrabold shrink-0 animate-pulse'
                  : 'text-slate-600 dark:text-slate-300 shrink-0'
              }`}
            >
              {secondsLeft.toFixed(1)}s
            </span>
          </div>

          <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3.5">
            <div
              ref={barRef}
              className="h-full rounded-full bg-emerald-500"
              style={{ width: '100%' }}
            />
          </div>

          {/* Balanced Cyber Reflex Card (Swipeable Left/Right + Compact Proportions on Desktop!) */}
          <div
            onTouchStart={(e) => onPointerDown(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => onPointerMove(e.touches[0].clientX)}
            onTouchEnd={onPointerEnd}
            onMouseDown={(e) => onPointerDown(e.clientX, e.clientY)}
            onMouseMove={(e) => {
              if (e.buttons === 1) onPointerMove(e.clientX)
            }}
            onMouseUp={onPointerEnd}
            onMouseLeave={() => {
              if (isDragging) onPointerEnd()
            }}
            style={{
              transform: `translate3d(${dragX}px, 0, 0) rotate(${dragX * 0.045}deg)`,
              transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            className={`relative min-h-[245px] sm:min-h-[275px] rounded-3xl p-5 sm:p-6 flex flex-col items-center justify-center text-center border-2 shadow-xl cursor-grab active:cursor-grabbing touch-none ${
              feedback === 'correct'
                ? 'bg-emerald-500/15 border-emerald-500'
                : feedback === 'wrong' || feedback === 'timeout'
                ? 'bg-rose-500/15 border-rose-500 animate-shake'
                : isFever
                ? 'bg-white dark:bg-slate-800 border-amber-500/70 shadow-amber-500/15'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80'
            }`}
          >
            {/* Swipe Stamps */}
            {rightStampOpacity > 0.05 && (
              <div
                style={{ opacity: rightStampOpacity }}
                className="absolute top-4 left-4 px-2.5 py-1 rounded-xl border-2 border-emerald-500 bg-emerald-500/15 text-emerald-500 font-black text-xs uppercase -rotate-12 pointer-events-none"
              >
                ✓ ĐÚNG
              </div>
            )}
            {leftStampOpacity > 0.05 && (
              <div
                style={{ opacity: leftStampOpacity }}
                className="absolute top-4 right-4 px-2.5 py-1 rounded-xl border-2 border-rose-500 bg-rose-500/15 text-rose-500 font-black text-xs uppercase rotate-12 pointer-events-none"
              >
                ✕ SAI
              </div>
            )}

            {/* Floating Score Pop */}
            {lastPointsPop && (
              <div className="absolute top-3 right-4 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-sm animate-floatUp">
                {lastPointsPop}
              </div>
            )}

            {/* Speaker button */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => audioService.speak(prompt.word.term, 0.95)}
              title="Nghe phát âm"
              className="absolute top-3.5 right-3.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-300 hover:text-indigo-500 transition-colors"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1.5">
              {prompt.word.partOfSpeech ? `(${prompt.word.partOfSpeech}) • ` : ''}Đúng hay Bẫy?
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight break-words">
              {prompt.word.term}
            </h2>
            {prompt.word.ipa && (
              <p className="text-xs font-sans font-semibold text-slate-400 mt-0.5">
                {prompt.word.ipa}
              </p>
            )}

            <div className="w-14 h-1 bg-gradient-to-r from-indigo-500/40 via-sky-400/60 to-emerald-500/40 my-3.5 rounded-full" />

            <p className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug break-words px-2">
              “{prompt.shownDefinition}”
            </p>

            {(feedback === 'wrong' || feedback === 'timeout') && (
              <div className="mt-3 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-200 font-semibold animate-fadeIn leading-snug">
                {feedback === 'timeout' ? '⏰ Hết giờ! ' : '💡 '}
                Nghĩa chuẩn: <strong>{prompt.word.definition}</strong>
              </div>
            )}
          </div>

          {/* 3D Tactile Arcade Push-Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-3.5">
            <button
              type="button"
              onClick={() => handleAnswer(false)}
              className="py-3.5 sm:py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 border-b-4 border-rose-800 active:border-b-0 active:translate-y-1 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 transition-all"
            >
              <X className="w-6 h-6 stroke-[2.8]" />
              <div className="flex flex-col items-start leading-none">
                <span>SAI</span>
                <span className="text-[10px] font-mono opacity-80 font-semibold mt-0.5">
                  Phím A / ◀
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleAnswer(true)}
              className="py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
            >
              <Check className="w-6 h-6 stroke-[2.8]" />
              <div className="flex flex-col items-start leading-none">
                <span>ĐÚNG</span>
                <span className="text-[10px] font-mono opacity-80 font-semibold mt-0.5">
                  Phím D / ▶
                </span>
              </div>
            </button>
          </div>

          <div className="mt-2.5 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Mẹo: Vuốt thẻ Trái / Phải hoặc bấm nút • Chuỗi 10 đúng hồi +1 ❤️
          </div>

          {/* Pause Overlay */}
          {isPaused && (
            <div className="absolute inset-0 rounded-3xl bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fadeIn z-20">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mb-3">
                <Pause className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Đang tạm dừng Blitz</h3>
              <p className="text-xs text-slate-400 mb-5">
                Câu {round} • Điểm hiện tại: <strong>{score.toLocaleString()}</strong>
              </p>

              <div className="w-full max-w-xs space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setIsPaused(false)
                  }}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Tiếp tục phản xạ</span>
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
                >
                  Về Đấu Trường chọn trò khác
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Game Over Summary */
        <div className="flex flex-col items-center justify-center p-5 text-center animate-fadeIn bg-white dark:bg-slate-800/80 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mb-3">
            <Flame className="w-8 h-8" />
          </div>

          {isNewRecord && (
            <span className="px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-1">
              Kỷ lục mới!
            </span>
          )}

          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Kết thúc Phản Xạ!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            Đúng <strong>{correctTotal} câu</strong> • Chuỗi cao nhất <strong>{maxStreak}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-5">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400">
                {score.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400">Tổng điểm</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-amber-500 flex items-center justify-center gap-1">
                <Trophy className="w-4 h-4" />
                <span>{bestScore.toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400">Kỷ lục cao nhất</div>
            </div>
          </div>

          {missedWords.length > 0 && (
            <div className="w-full max-w-xs mb-4 text-left bg-slate-50 dark:bg-slate-900/70 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500">
                Từ vừa mắc bẫy (Chạm 🔊 để nhớ ngay)
              </div>
              {missedWords.map((mw) => (
                <div key={mw.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <div className="min-w-0">
                    <span className="font-extrabold text-slate-900 dark:text-white">{mw.term}</span>
                    <span className="text-slate-500 dark:text-slate-400 block truncate text-[11px]">
                      {mw.definition}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const next = storageService.toggleWordStar(mw.id)
                        audioService.playClick()
                        setMissedWords((prev) =>
                          prev.map((item) => (item.id === mw.id ? { ...item, starred: next } : item))
                        )
                      }}
                      title="Đánh dấu sao từ này"
                      className={`p-1.5 rounded-lg transition-colors ${
                        mw.starred
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-slate-200/60 dark:bg-slate-800 text-slate-400 hover:text-amber-500'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${mw.starred ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void audioService.speak(mw.term, 0.9)}
                      className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500"
                      title="Nghe phát âm"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="w-full max-w-xs space-y-2.5">
            {missedWords.length > 0 && onStudyMissedWords && (
              <button
                type="button"
                onClick={() => {
                  audioService.playClick()
                  onStudyMissedWords(missedWords)
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ôn kỹ {missedWords.length} từ vừa mắc bẫy ngay</span>
              </button>
            )}
            <button
              type="button"
              onClick={restartBlitz}
              className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thử thách lại ngay</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 rounded-xl bg-slate-200/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Về Đấu Trường chọn trò khác
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
