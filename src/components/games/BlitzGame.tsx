import confetti from 'canvas-confetti'
import { ArrowLeft, Check, Flame, Heart, RotateCcw, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_WORDS } from '../../data/initialDecks'
import type { WordItem } from '../../types'
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

function getDurationForRound(round: number): number {
  if (round <= 5) return 2600
  if (round <= 12) return 2250
  if (round <= 20) return 2000
  return 1750
}

export function BlitzGame({ words, deckName, onBack }: BlitzGameProps) {
  const getPool = useCallback((): WordItem[] => {
    if (words.length >= 6) return words
    const merged = [...words]
    const seen = new Set(words.map((w) => w.term.toLowerCase()))
    for (const iw of INITIAL_WORDS) {
      if (!seen.has(iw.term.toLowerCase())) {
        seen.add(iw.term.toLowerCase())
        merged.push(iw)
      }
      if (merged.length >= 16) break
    }
    return merged
  }, [words])

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
          (w) => w.definition.trim().toLowerCase() !== word.definition.trim().toLowerCase()
        )
        if (traps.length > 0) {
          const trapWord = traps[Math.floor(Math.random() * traps.length)]
          shownDefinition = trapWord.definition
        } else {
          return {
            word,
            shownDefinition: word.definition,
            isMatch: true,
            durationMs: getDurationForRound(roundNum),
          }
        }
      }

      return {
        word,
        shownDefinition,
        isMatch,
        durationMs: getDurationForRound(roundNum),
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
  const [progressPct, setProgressPct] = useState(100)
  const [secondsLeft, setSecondsLeft] = useState(2.6)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['blitz-2s'] || 0
  )

  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const lockedRef = useRef(false)
  const deadlineRef = useRef(0)

  const endGame = useCallback((finalScore: number) => {
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
  }, [])

  const advanceNextRound = useCallback(
    (nextRoundNum: number, prevId: string) => {
      const nextP = generatePrompt(nextRoundNum, prevId)
      setPrompt(nextP)
      setRound(nextRoundNum)
      setFeedback('none')
      setProgressPct(100)
      setSecondsLeft(Number((nextP.durationMs / 1000).toFixed(1)))
      deadlineRef.current = performance.now() + nextP.durationMs
      lockedRef.current = false
    },
    [generatePrompt]
  )

  const handleTimeout = useCallback(() => {
    if (lockedRef.current || isGameOver) return
    lockedRef.current = true

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

    setTimeout(() => {
      if (nextLives <= 0) {
        endGame(scoreRef.current)
      } else {
        advanceNextRound(round + 1, prompt.word.id)
      }
    }, 1150)
  }, [isGameOver, round, prompt.word.id, endGame, advanceNextRound])

  // 60fps Timer Bar Loop
  useEffect(() => {
    if (isGameOver) return
    deadlineRef.current = performance.now() + prompt.durationMs

    let rafId = 0
    const tick = (now: number) => {
      if (!lockedRef.current) {
        const remaining = Math.max(0, deadlineRef.current - now)
        const pct = (remaining / prompt.durationMs) * 100
        setProgressPct(pct)
        setSecondsLeft(Number((remaining / 1000).toFixed(1)))

        if (remaining <= 0) {
          handleTimeout()
          return
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [prompt, isGameOver, handleTimeout])

  const handleAnswer = useCallback(
    (userSaysMatch: boolean) => {
      if (lockedRef.current || isGameOver) return
      lockedRef.current = true

      const isRight = userSaysMatch === prompt.isMatch

      if (isRight) {
        const nextStreak = streak + 1
        const isFever = nextStreak >= 5
        const timeBonus = Math.round((progressPct / 100) * 30)
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

        setTimeout(() => {
          advanceNextRound(round + 1, prompt.word.id)
        }, 230)
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

        setTimeout(() => {
          if (nextLives <= 0) {
            endGame(scoreRef.current)
          } else {
            advanceNextRound(round + 1, prompt.word.id)
          }
        }, 1150)
      }
    },
    [isGameOver, prompt, streak, progressPct, round, advanceNextRound, endGame]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isGameOver || lockedRef.current) return
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
  }, [isGameOver, handleAnswer])

  const restartBlitz = () => {
    audioService.playClick()
    scoreRef.current = 0
    livesRef.current = 3
    lockedRef.current = false
    setScore(0)
    setLives(3)
    setStreak(0)
    setMaxStreak(0)
    setCorrectTotal(0)
    setIsNewRecord(false)
    setIsGameOver(false)
    const first = generatePrompt(1)
    setPrompt(first)
    setRound(1)
    setFeedback('none')
    setProgressPct(100)
    setSecondsLeft(2.6)
    deadlineRef.current = performance.now() + first.durationMs
  }

  const isFever = streak >= 5

  return (
    <div
      className="w-full flex-1 flex flex-col max-w-md mx-auto px-3.5 py-2 select-none"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          title="Thoát trò chơi"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

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
        <>
          {/* Urgent 2-Second Bar */}
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 px-1">
            <span className="text-slate-400 uppercase tracking-wider text-[11px]">
              Câu {round} • {deckName}
            </span>
            <span
              className={
                progressPct <= 35
                  ? 'text-rose-500 font-extrabold'
                  : 'text-slate-600 dark:text-slate-300'
              }
            >
              {secondsLeft.toFixed(1)}s
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-5">
            <div
              className={`h-full rounded-full ${
                progressPct <= 35
                  ? 'bg-rose-500'
                  : progressPct <= 65
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Blitz Flash Card */}
          <div
            className={`flex-1 rounded-3xl p-6 flex flex-col items-center justify-center text-center border-2 transition-all my-auto shadow-lg ${
              feedback === 'correct'
                ? 'bg-emerald-500/15 border-emerald-500'
                : feedback === 'wrong' || feedback === 'timeout'
                ? 'bg-rose-500/15 border-rose-500 animate-shake'
                : isFever
                ? 'bg-white dark:bg-slate-800 border-amber-500/60 shadow-amber-500/10'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Cặp từ — nghĩa này Đúng hay Sai?
            </span>

            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight break-words">
              {prompt.word.term}
            </h2>
            {prompt.word.ipa && (
              <p className="text-xs font-sans font-semibold text-indigo-500 dark:text-indigo-400 mt-1">
                {prompt.word.ipa}
              </p>
            )}

            <div className="w-12 h-0.5 bg-slate-200 dark:bg-slate-700 my-5 rounded-full" />

            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug break-words px-2">
              "{prompt.shownDefinition}"
            </p>

            {(feedback === 'wrong' || feedback === 'timeout') && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-600 dark:text-rose-300 font-semibold animate-fadeIn">
                {feedback === 'timeout' ? 'Hết 2 giây! ' : 'Chưa chuẩn! '}
                Nghĩa thật của <strong>{prompt.word.term}</strong> là:{' '}
                <span className="underline">{prompt.word.definition}</span>
              </div>
            )}
          </div>

          {/* Giant 2-Thumb Action Buttons */}
          <div className="grid grid-cols-2 gap-3.5 pt-5 pb-2">
            <button
              type="button"
              onClick={() => handleAnswer(false)}
              className="py-5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition-transform"
            >
              <X className="w-6 h-6 stroke-[2.5]" />
              <span>SAI</span>
            </button>

            <button
              type="button"
              onClick={() => handleAnswer(true)}
              className="py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform"
            >
              <Check className="w-6 h-6 stroke-[2.5]" />
              <span>ĐÚNG</span>
            </button>
          </div>
        </>
      ) : (
        /* Game Over Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center animate-fadeIn">
          <div className="w-18 h-18 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mb-4">
            <Flame className="w-9 h-9" />
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
            Phản xạ đúng <strong>{correctTotal} câu</strong> • Chuỗi liên tiếp cao nhất: <strong>{maxStreak}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-6">
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
