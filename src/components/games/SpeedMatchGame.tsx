import confetti from 'canvas-confetti'
import { ArrowLeft, Clock, Flame, RotateCcw, Trophy, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_WORDS } from '../../data/initialDecks'
import type { WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface SpeedMatchGameProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface MatchCardSlot {
  wordId: string
  text: string
  status: 'idle' | 'matched' | 'wrong'
}

const BOARD_ROWS = 5
const INITIAL_TIME = 60

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function createPureInitialSlots(pool: WordItem[]): {
  left: Array<MatchCardSlot | null>
  right: Array<MatchCardSlot | null>
} {
  const batch = shuffle(pool).slice(0, BOARD_ROWS)
  const left: Array<MatchCardSlot | null> = shuffle(batch).map((w) => ({
    wordId: w.id,
    text: w.term,
    status: 'idle',
  }))
  const right: Array<MatchCardSlot | null> = shuffle(batch).map((w) => ({
    wordId: w.id,
    text: w.definition,
    status: 'idle',
  }))
  return { left, right }
}

export function SpeedMatchGame({ words, deckName, onBack }: SpeedMatchGameProps) {
  const getPool = useCallback((): WordItem[] => {
    if (words.length >= 8) return words
    const merged = [...words]
    const seen = new Set(words.map((w) => w.term.toLowerCase()))
    for (const iw of INITIAL_WORDS) {
      if (!seen.has(iw.term.toLowerCase())) {
        seen.add(iw.term.toLowerCase())
        merged.push(iw)
      }
      if (merged.length >= 20) break
    }
    return merged
  }, [words])

  const drawQueueRef = useRef<WordItem[]>([])

  const pullNextWords = useCallback(
    (count: number, excludeIds: Set<string>): WordItem[] => {
      const pool = getPool()
      const picked: WordItem[] = []

      for (let safety = 0; safety < 4 && picked.length < count; safety++) {
        if (drawQueueRef.current.length === 0) {
          drawQueueRef.current = shuffle(pool)
        }
        while (drawQueueRef.current.length > 0 && picked.length < count) {
          const candidate = drawQueueRef.current.pop()!
          if (!excludeIds.has(candidate.id) && !picked.some((p) => p.id === candidate.id)) {
            picked.push(candidate)
          }
        }
      }
      return picked
    },
    [getPool]
  )

  const [initialBoard] = useState(() => createPureInitialSlots(getPool()))
  const [leftSlots, setLeftSlots] = useState<Array<MatchCardSlot | null>>(
    () => initialBoard.left
  )
  const [rightSlots, setRightSlots] = useState<Array<MatchCardSlot | null>>(
    () => initialBoard.right
  )

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null)
  const [selectedRight, setSelectedRight] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME)
  const [bonusToast, setBonusToast] = useState<string | null>(null)
  const [isFinished, setIsFinished] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['speed-match'] || 0
  )

  const scoreRef = useRef(0)
  const lastMatchAtRef = useRef(0)

  const finishGame = useCallback((finalScore: number) => {
    setIsFinished(true)
    const isNew = storageService.saveHighScore('speed-match', finalScore)
    setIsNewRecord(isNew)
    setBestScore(storageService.getHighScores()['speed-match'] || finalScore)
    if (isNew && finalScore > 0) {
      audioService.playSuccessChime()
      try {
        confetti({ particleCount: 65, spread: 70, origin: { y: 0.6 } })
      } catch {}
    }
  }, [])

  // Countdown timer
  useEffect(() => {
    if (isFinished) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(timer)
          finishGame(scoreRef.current)
          return 0
        }
        return Math.max(0, Number((prev - 0.1).toFixed(1)))
      })
    }, 100)

    return () => clearInterval(timer)
  }, [isFinished, finishGame])

  const restartGame = () => {
    audioService.playClick()
    drawQueueRef.current = []
    const batch = pullNextWords(BOARD_ROWS, new Set())
    setLeftSlots(
      shuffle(batch).map((w) => ({
        wordId: w.id,
        text: w.term,
        status: 'idle',
      }))
    )
    setRightSlots(
      shuffle(batch).map((w) => ({
        wordId: w.id,
        text: w.definition,
        status: 'idle',
      }))
    )
    scoreRef.current = 0
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setMatchedCount(0)
    setSelectedLeft(null)
    setSelectedRight(null)
    setBonusToast(null)
    setIsNewRecord(false)
    setTimeLeft(INITIAL_TIME)
    setIsFinished(false)
  }

  const checkPair = (lIdx: number, rIdx: number) => {
    const lCard = leftSlots[lIdx]
    const rCard = rightSlots[rIdx]
    if (!lCard || !rCard || lCard.status !== 'idle' || rCard.status !== 'idle') return

    if (lCard.wordId === rCard.wordId) {
      // MATCHED!
      const now = Date.now()
      const withinComboWindow = now - lastMatchAtRef.current < 4000
      lastMatchAtRef.current = now

      const nextCombo = withinComboWindow ? combo + 1 : 1
      const multiplier = Math.min(5, 1 + Math.floor(nextCombo / 3))
      const gained = 50 * multiplier

      scoreRef.current += gained
      setScore(scoreRef.current)
      setCombo(nextCombo)
      setMaxCombo((prev) => Math.max(prev, nextCombo))
      setMatchedCount((prev) => prev + 1)
      setSelectedLeft(null)
      setSelectedRight(null)

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(25)
        } catch {}
      }
      audioService.playCombo(nextCombo)
      storageService.recordDailyActivity(true)

      // Bonus +3 seconds every 5 combo streak!
      if (nextCombo > 0 && nextCombo % 5 === 0) {
        setTimeLeft((t) => Math.min(90, Number((t + 3).toFixed(1))))
        setBonusToast(`Combo x${nextCombo}! +3 giây`)
        setTimeout(() => setBonusToast(null), 1300)
      }

      // Mark matched green flash
      setLeftSlots((prev) =>
        prev.map((s, idx) => (idx === lIdx && s ? { ...s, status: 'matched' } : s))
      )
      setRightSlots((prev) =>
        prev.map((s, idx) => (idx === rIdx && s ? { ...s, status: 'matched' } : s))
      )

      // Clear matched slots after 220ms; refill when >= 2 slots are empty!
      setTimeout(() => {
        setLeftSlots((prevLeft) => {
          const updatedLeft = prevLeft.map((s, idx) => (idx === lIdx ? null : s))
          const emptyLeftIndices = updatedLeft
            .map((s, idx) => (s === null ? idx : -1))
            .filter((idx) => idx !== -1)

          if (emptyLeftIndices.length >= 2) {
            setRightSlots((prevRight) => {
              const updatedRight = prevRight.map((s, idx) => (idx === rIdx ? null : s))
              const emptyRightIndices = updatedRight
                .map((s, idx) => (s === null ? idx : -1))
                .filter((idx) => idx !== -1)

              const refillCount = Math.min(emptyLeftIndices.length, emptyRightIndices.length)
              const activeIds = new Set(
                updatedLeft.filter((s): s is MatchCardSlot => s !== null).map((s) => s.wordId)
              )
              const freshWords = pullNextWords(refillCount, activeIds)
              const shuffledLeftWords = shuffle(freshWords)
              const shuffledRightWords = shuffle(freshWords)

              const nextL = [...updatedLeft]
              const nextR = [...updatedRight]

              shuffledLeftWords.forEach((w, i) => {
                nextL[emptyLeftIndices[i]] = {
                  wordId: w.id,
                  text: w.term,
                  status: 'idle',
                }
              })
              shuffledRightWords.forEach((w, i) => {
                nextR[emptyRightIndices[i]] = {
                  wordId: w.id,
                  text: w.definition,
                  status: 'idle',
                }
              })

              setLeftSlots(nextL)
              return nextR
            })
            return updatedLeft
          } else {
            setRightSlots((prevRight) => prevRight.map((s, idx) => (idx === rIdx ? null : s)))
            return updatedLeft
          }
        })
      }, 220)
    } else {
      // WRONG PAIR!
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([70, 40, 70])
        } catch {}
      }
      audioService.playErrorBuzz()
      setCombo(0)
      setSelectedLeft(null)
      setSelectedRight(null)

      setLeftSlots((prev) =>
        prev.map((s, idx) => (idx === lIdx && s ? { ...s, status: 'wrong' } : s))
      )
      setRightSlots((prev) =>
        prev.map((s, idx) => (idx === rIdx && s ? { ...s, status: 'wrong' } : s))
      )

      setTimeout(() => {
        setLeftSlots((prev) =>
          prev.map((s, idx) => (idx === lIdx && s?.status === 'wrong' ? { ...s, status: 'idle' } : s))
        )
        setRightSlots((prev) =>
          prev.map((s, idx) => (idx === rIdx && s?.status === 'wrong' ? { ...s, status: 'idle' } : s))
        )
      }, 360)
    }
  }

  const handleSelectLeft = (idx: number) => {
    if (isFinished) return
    const slot = leftSlots[idx]
    if (!slot || slot.status !== 'idle') return

    audioService.playClick()
    if (selectedLeft === idx) {
      setSelectedLeft(null)
      return
    }
    if (selectedRight !== null) {
      checkPair(idx, selectedRight)
    } else {
      setSelectedLeft(idx)
    }
  }

  const handleSelectRight = (idx: number) => {
    if (isFinished) return
    const slot = rightSlots[idx]
    if (!slot || slot.status !== 'idle') return

    audioService.playClick()
    if (selectedRight === idx) {
      setSelectedRight(null)
      return
    }
    if (selectedLeft !== null) {
      checkPair(selectedLeft, idx)
    } else {
      setSelectedRight(idx)
    }
  }

  const timePercent = Math.min(100, (timeLeft / INITIAL_TIME) * 100)

  return (
    <div
      className="w-full flex-1 flex flex-col max-w-md mx-auto px-3.5 py-2 select-none"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          title="Thoát trò chơi"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
              timeLeft <= 10
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-pulse'
                : 'bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{Math.ceil(timeLeft)}s</span>
          </div>

          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {score.toLocaleString()} đ
          </span>
        </div>

        <div className="min-w-14 text-right">
          {combo >= 2 && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold">
              <Flame className="w-3 h-3" />
              x{combo}
            </span>
          )}
        </div>
      </div>

      {/* Timer Bar */}
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3 relative">
        <div
          className={`h-full transition-all duration-100 rounded-full ${
            timeLeft <= 10
              ? 'bg-rose-500'
              : timeLeft <= 25
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${timePercent}%` }}
        />
      </div>

      {bonusToast && (
        <div className="mb-2 py-1 px-3 rounded-full bg-emerald-500 text-white text-xs font-extrabold mx-auto shadow-md animate-bounce">
          {bonusToast}
        </div>
      )}

      {!isFinished ? (
        <>
          <div className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-2">
            Chạm nối nhanh 1 ô Tiếng Anh với 1 ô Nghĩa Tiếng Việt ({deckName})
          </div>

          {/* 2x5 Match Grid */}
          <div className="flex-1 grid grid-cols-2 gap-2.5 my-auto">
            {/* Left Column: English Terms */}
            <div className="flex flex-col gap-2.5">
              {leftSlots.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`l-empty-${idx}`}
                      className="flex-1 min-h-[64px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/60"
                    />
                  )
                }

                const isSelected = selectedLeft === idx
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 hover:border-indigo-400'

                if (slot.status === 'matched') {
                  cardStyle =
                    'bg-emerald-500 text-white border-emerald-500 scale-95 opacity-80'
                } else if (slot.status === 'wrong') {
                  cardStyle =
                    'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500 animate-shake'
                } else if (isSelected) {
                  cardStyle =
                    'bg-indigo-600 text-white border-indigo-500 ring-2 ring-indigo-500/30 scale-[1.02]'
                }

                return (
                  <button
                    key={`l-${idx}-${slot.wordId}`}
                    type="button"
                    onClick={() => handleSelectLeft(idx)}
                    className={`flex-1 min-h-[64px] p-2.5 rounded-2xl border-2 font-bold text-sm flex items-center justify-center text-center shadow-2xs transition-all duration-150 break-words leading-snug ${cardStyle}`}
                  >
                    {slot.text}
                  </button>
                )
              })}
            </div>

            {/* Right Column: Vietnamese Definitions */}
            <div className="flex flex-col gap-2.5">
              {rightSlots.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`r-empty-${idx}`}
                      className="flex-1 min-h-[64px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/60"
                    />
                  )
                }

                const isSelected = selectedRight === idx
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-emerald-400'

                if (slot.status === 'matched') {
                  cardStyle =
                    'bg-emerald-500 text-white border-emerald-500 scale-95 opacity-80'
                } else if (slot.status === 'wrong') {
                  cardStyle =
                    'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500 animate-shake'
                } else if (isSelected) {
                  cardStyle =
                    'bg-indigo-600 text-white border-indigo-500 ring-2 ring-indigo-500/30 scale-[1.02]'
                }

                return (
                  <button
                    key={`r-${idx}-${slot.wordId}`}
                    type="button"
                    onClick={() => handleSelectRight(idx)}
                    className={`flex-1 min-h-[64px] p-2 rounded-2xl border-2 font-medium text-xs flex items-center justify-center text-center shadow-2xs transition-all duration-150 leading-snug line-clamp-3 break-words ${cardStyle}`}
                  >
                    {slot.text}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        /* Summary Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center animate-fadeIn">
          <div className="w-18 h-18 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mb-4">
            <Zap className="w-9 h-9" />
          </div>

          {isNewRecord && (
            <span className="px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-1">
              Kỷ lục mới!
            </span>
          )}

          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Hết giờ thi đấu!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            Bạn đã ghép chuẩn <strong>{matchedCount} cặp từ</strong> với chuỗi Combo tối đa <strong>x{maxCombo}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-6">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
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
              onClick={restartGame}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Chơi lại phá kỷ lục</span>
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
