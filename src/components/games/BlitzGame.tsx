import confetti from 'canvas-confetti'
import { ArrowLeft, Check, Flame, Heart, Pause, Play, RotateCcw, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface BlitzGameProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface BlitzPrompt {
  word: WordItem
  shownDefinition: string
  isMatch: boolean
  durationMs: number
}

function getDurationForRound(round: number, defLength: number): number {
  let base = 2050
  if (round === 1) base = 3400
  else if (round <= 6) base = 2900
  else if (round <= 14) base = 2550
  else if (round <= 24) base = 2250

  // Fair reading allowance for multi-clause Vietnamese meanings
  const lengthBonus = defLength > 52 ? 450 : 0
  return base + lengthBonus
}

function buildBlitzPool(words: WordItem[]): WordItem[] {
  const normalized = words
    .filter((w) => w.term.length <= 32)
    .map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 92) }))
  const base =
    normalized.length >= 6
      ? normalized
      : words.map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 92) }))

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
    const formatted = { ...iw, definition: formatArcadeMeaning(iw.definition, 92) }
    const tk = formatted.term.trim().toLowerCase()
    if (!seen.has(tk)) {
      seen.add(tk)
      unique.push(formatted)
    }
    if (unique.length >= 18) break
  }
  return unique
}

export function BlitzGame({ words, deckName, onBack }: BlitzGameProps) {
  const getPool = useCallback(() => buildBlitzPool(words), [words])

  const generatePrompt = useCallback(
    (roundNum: number, prevWordId?: string): BlitzPrompt => {
      const pool = getPool()
      const candidates = pool.filter((w) => w.id !== prevWordId)
      const sourceList = candidates.length > 0 ? candidates : pool
      const word = sourceList[Math.floor(Math.random() * sourceList.length)]

      const isMatch = Math.random() < 0.5
      let shownDefinition = word.definition

      if (!isMatch) {
        const traps = pool.filter(
          (w) =>
            w.term.trim().toLowerCase() !== word.term.trim().toLowerCase() &&
            w.definition.trim().toLowerCase() !== word.definition.trim().toLowerCase()
        )
        if (traps.length > 0) {
          const trapWord = traps[Math.floor(Math.random() * traps.length)]
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
    },
    [getPool]
  )

  const [prompt, setPrompt] = useState<BlitzPrompt>(() => generatePrompt(1))
  const [round, setRound] = useState(1)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [correctTotal, setCorrectTotal] = useState(0)
  const [lives, setLives] = useState(3)
  const [feedback, setFeedback] = useState<'none' | 'correct' | 'wrong' | 'timeout'>('none')
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

  const barRef = useRef<HTMLDivElement | null>(null)
  const progressPctRef = useRef(100)
  const remainingMsRef = useRef(prompt.durationMs)
  const lastTenthsRef = useRef(Math.round(prompt.durationMs / 100))
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
      pct <= 35 ? 'bg-rose-500' : pct <= 65 ? 'bg-amber-500' : 'bg-emerald-500'
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

      setPrompt(nextP)
      setRound(nextRoundNum)
      setFeedback('none')
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

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([80, 40, 80])
      } catch {}
    }
    audioService.playErrorBuzz()
    setFeedback('timeout')
    setStreak(0)

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
    }, 1400)
  }, [isGameOver, round, prompt.word.id, applyBarVisual, clearFeedbackTimeout, endGame, advanceNextRound])

  // Cleanup on unmount & auto-pause on tab hide
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

  // Direct DOM 60fps Timer Bar Loop (avoids 60 React re-renders/sec!)
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

      const isRight = userSaysMatch === prompt.isMatch

      if (isRight) {
        const nextStreak = streak + 1
        const isFever = nextStreak >= 5
        const timeBonus = Math.round((progressPctRef.current / 100) * 30)
        const gained = (50 + timeBonus) * (isFever ? 2 : 1)

        scoreRef.current += gained
        setScore(scoreRef.current)
        setStreak(nextStreak)
        setMaxStreak((prev) => Math.max(prev, nextStreak))
        setCorrectTotal((prev) => prev + 1)
        setFeedback('correct')

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(25)
          } catch {}
        }
        audioService.playCombo(nextStreak)
        storageService.recordDailyActivity(true)

        clearFeedbackTimeout()
        feedbackTimeoutRef.current = window.setTimeout(() => {
          feedbackTimeoutRef.current = null
          advanceNextRound(round + 1, prompt.word.id)
        }, 220)
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([80, 40, 80])
          } catch {}
        }
        audioService.playErrorBuzz()
        setFeedback('wrong')
        setStreak(0)

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
        }, 1150)
      }
    },
    [isGameOver, isPaused, prompt, streak, round, clearFeedbackTimeout, advanceNextRound, endGame]
  )

  // Keyboard shortcuts (binds only once per round instead of 60x/sec!)
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

    const first = generatePrompt(1)
    remainingMsRef.current = first.durationMs
    lastTenthsRef.current = Math.round(first.durationMs / 100)

    setScore(0)
    setLives(3)
    setStreak(0)
    setMaxStreak(0)
    setCorrectTotal(0)
    setIsNewRecord(false)
    setIsPaused(false)
    setIsGameOver(false)
    setPrompt(first)
    setRound(1)
    setFeedback('none')
    setIsUrgentText(false)
    setSecondsLeft(Number((first.durationMs / 1000).toFixed(1)))
    applyBarVisual(100)
  }

  const isFever = streak >= 5

  return (
    <div
      className="w-full flex-1 flex flex-col max-w-md mx-auto px-3.5 py-1.5 select-none relative"
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
                if (!lockedRef.current) {
                  audioService.playClick()
                  setIsPaused((p) => !p)
                }
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
              title={isPaused ? 'Tiếp tục (P)' : 'Tạm dừng (P)'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {score.toLocaleString()} đ
          </span>
          {streak >= 2 && (
            <span
              className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                isFever
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              {isFever ? `FEVER x2 (${streak})` : `Chuỗi ${streak}`}
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
        <div className="flex-1 flex flex-col relative">
          {/* Urgent 2-Second Bar */}
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 px-1 gap-2">
            <span className="text-slate-400 uppercase tracking-wider text-[11px] truncate">
              Câu {round} • {deckName}
            </span>
            <span
              className={
                isUrgentText
                  ? 'text-rose-500 font-extrabold shrink-0'
                  : 'text-slate-600 dark:text-slate-300 shrink-0'
              }
            >
              {secondsLeft.toFixed(1)}s
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3.5 sm:mb-5">
            <div
              ref={barRef}
              className="h-full rounded-full bg-emerald-500"
              style={{ width: '100%' }}
            />
          </div>

          {/* Blitz Flash Card */}
          <div
            className={`flex-1 rounded-3xl p-4 sm:p-6 flex flex-col items-center justify-center text-center border-2 transition-colors my-auto shadow-lg ${
              feedback === 'correct'
                ? 'bg-emerald-500/15 border-emerald-500'
                : feedback === 'wrong' || feedback === 'timeout'
                ? 'bg-rose-500/15 border-rose-500 animate-shake'
                : isFever
                ? 'bg-white dark:bg-slate-800 border-amber-500/60 shadow-amber-500/10'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Cặp từ — nghĩa này Đúng hay Sai?
            </span>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words">
              {prompt.word.term}
            </h2>
            {prompt.word.ipa && (
              <p className="text-xs font-sans font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">
                {prompt.word.ipa}
              </p>
            )}

            <div className="w-12 h-0.5 bg-slate-200 dark:bg-slate-700 my-3.5 sm:my-5 rounded-full" />

            <p className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug break-words px-2">
              "{prompt.shownDefinition}"
            </p>

            {(feedback === 'wrong' || feedback === 'timeout') && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-600 dark:text-rose-300 font-semibold animate-fadeIn leading-relaxed">
                {feedback === 'timeout' ? (
                  <>
                    Hết giờ! Đáp án là <strong>{prompt.isMatch ? 'ĐÚNG' : 'SAI'}</strong> — Nghĩa của{' '}
                    <strong>{prompt.word.term}</strong> là:{' '}
                    <span className="underline">{prompt.word.definition}</span>
                  </>
                ) : prompt.isMatch ? (
                  <>
                    Cặp này <strong>ĐÚNG</strong> đấy! <strong>{prompt.word.term}</strong> chính là:{' '}
                    <span className="underline">{prompt.word.definition}</span>
                  </>
                ) : (
                  <>
                    Bẫy đấy (<strong>SAI</strong>)! Nghĩa thật của <strong>{prompt.word.term}</strong> là:{' '}
                    <span className="underline">{prompt.word.definition}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Giant 2-Thumb Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-3.5 sm:pt-5 pb-1">
            <button
              type="button"
              onClick={() => handleAnswer(false)}
              className="py-4 sm:py-5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition-transform"
            >
              <X className="w-6 h-6 stroke-[2.5]" />
              <span>SAI</span>
            </button>

            <button
              type="button"
              onClick={() => handleAnswer(true)}
              className="py-4 sm:py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform"
            >
              <Check className="w-6 h-6 stroke-[2.5]" />
              <span>ĐÚNG</span>
            </button>
          </div>

          {/* Pause Overlay hides current prompt so timer can't be abused */}
          {isPaused && (
            <div className="absolute inset-0 rounded-3xl bg-slate-950/88 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fadeIn z-20">
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
        /* Game Over Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mb-3">
            <Flame className="w-8 h-8" />
          </div>

          {isNewRecord && (
            <span className="px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-1">
              Kỷ lục mới!
            </span>
          )}

          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Kết thúc Blitz 2 Giây!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            Phản xạ đúng <strong>{correctTotal} câu</strong> • Chuỗi liên tiếp cao nhất:{' '}
            <strong>{maxStreak}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-5">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400">
                {score.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400">Tổng điểm</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-amber-500 flex items-center justify-center gap-1">
                <Trophy className="w-4 h-4" />
                <span>{bestScore.toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400">Kỷ lục cao nhất</div>
            </div>
          </div>

          <div className="w-full max-w-xs space-y-2.5">
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
              className="w-full py-3 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Về Đấu Trường chọn trò khác
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
