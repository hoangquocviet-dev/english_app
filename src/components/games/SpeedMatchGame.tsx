import confetti from 'canvas-confetti'
import { ArrowLeft, Clock, Flame, Pause, Play, RotateCcw, Trophy, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_WORDS } from '../../data/initialDecks'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface SpeedMatchGameProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface MatchCardSlot {
  wordId: string
  termKey: string
  defKey: string
  text: string
  status: 'idle' | 'matched' | 'wrong'
}

interface BoardState {
  left: Array<MatchCardSlot | null>
  right: Array<MatchCardSlot | null>
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

function buildPlayablePool(words: WordItem[]): WordItem[] {
  const normalized = words
    .filter((w) => w.term.length <= 32)
    .map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 88) }))
  const base = normalized.length >= 8 ? normalized : words.map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 88) }))

  // Deduplicate by term + definition so pairs on board are always unambiguous
  const unique: WordItem[] = []
  const seenTerms = new Set<string>()
  const seenDefs = new Set<string>()

  for (const w of base) {
    const tk = w.term.trim().toLowerCase()
    const dk = w.definition.trim().toLowerCase()
    if (!seenTerms.has(tk) && !seenDefs.has(dk)) {
      seenTerms.add(tk)
      seenDefs.add(dk)
      unique.push(w)
    }
  }

  if (unique.length >= 10) return unique

  for (const iw of INITIAL_WORDS) {
    if (iw.term.length > 28) continue
    const formatted = { ...iw, definition: formatArcadeMeaning(iw.definition, 88) }
    const tk = formatted.term.trim().toLowerCase()
    const dk = formatted.definition.trim().toLowerCase()
    if (!seenTerms.has(tk) && !seenDefs.has(dk)) {
      seenTerms.add(tk)
      seenDefs.add(dk)
      unique.push(formatted)
    }
    if (unique.length >= 20) break
  }

  return unique
}

function createInitialBoard(pool: WordItem[]): BoardState {
  const batch = shuffle(pool).slice(0, BOARD_ROWS)
  const left: Array<MatchCardSlot | null> = shuffle(batch).map((w) => ({
    wordId: w.id,
    termKey: w.term.trim().toLowerCase(),
    defKey: w.definition.trim().toLowerCase(),
    text: w.term,
    status: 'idle',
  }))
  const right: Array<MatchCardSlot | null> = shuffle(batch).map((w) => ({
    wordId: w.id,
    termKey: w.term.trim().toLowerCase(),
    defKey: w.definition.trim().toLowerCase(),
    text: w.definition,
    status: 'idle',
  }))
  return { left, right }
}

export function SpeedMatchGame({ words, deckName, onBack }: SpeedMatchGameProps) {
  const getPool = useCallback(() => buildPlayablePool(words), [words])

  const drawQueueRef = useRef<WordItem[]>([])
  const timeoutsRef = useRef<number[]>([])

  const clearAllTimeouts = useCallback(() => {
    for (const id of timeoutsRef.current) {
      window.clearTimeout(id)
    }
    timeoutsRef.current = []
  }, [])

  const scheduleTimeout = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id)
      fn()
    }, delayMs)
    timeoutsRef.current.push(id)
  }, [])

  const pullNextWords = useCallback(
    (
      count: number,
      excludeIds: Set<string>,
      excludeTerms: Set<string>,
      excludeDefs: Set<string>
    ): WordItem[] => {
      const pool = getPool()
      const picked: WordItem[] = []

      for (let safety = 0; safety < 4 && picked.length < count; safety++) {
        if (drawQueueRef.current.length === 0) {
          drawQueueRef.current = shuffle(pool)
        }
        while (drawQueueRef.current.length > 0 && picked.length < count) {
          const candidate = drawQueueRef.current.pop()!
          const tk = candidate.term.trim().toLowerCase()
          const dk = candidate.definition.trim().toLowerCase()
          if (
            !excludeIds.has(candidate.id) &&
            !excludeTerms.has(tk) &&
            !excludeDefs.has(dk) &&
            !picked.some(
              (p) =>
                p.id === candidate.id ||
                p.term.trim().toLowerCase() === tk ||
                p.definition.trim().toLowerCase() === dk
            )
          ) {
            picked.push(candidate)
          }
        }
      }
      return picked
    },
    [getPool]
  )

  const [board, setBoard] = useState<BoardState>(() => createInitialBoard(buildPlayablePool(words)))
  const boardRef = useRef<BoardState>(board)

  const commitBoard = useCallback((next: BoardState) => {
    boardRef.current = next
    setBoard(next)
  }, [])

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null)
  const [selectedRight, setSelectedRight] = useState<number | null>(null)
  const selectedLeftRef = useRef<number | null>(null)
  const selectedRightRef = useRef<number | null>(null)

  const updateSelectedLeft = useCallback((val: number | null) => {
    selectedLeftRef.current = val
    setSelectedLeft(val)
  }, [])

  const updateSelectedRight = useCallback((val: number | null) => {
    selectedRightRef.current = val
    setSelectedRight(val)
  }, [])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME)
  const [bonusToast, setBonusToast] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['speed-match'] || 0
  )

  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const timeLeftRef = useRef(INITIAL_TIME)
  const lastMatchAtRef = useRef(0)

  const finishGame = useCallback(
    (finalScore: number) => {
      clearAllTimeouts()
      setIsPaused(false)
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
    },
    [clearAllTimeouts]
  )

  // Cleanup timeouts on unmount & auto-pause on tab switch
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !isFinished) {
        setIsPaused(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearAllTimeouts()
    }
  }, [isFinished, clearAllTimeouts])

  // Pure countdown timer (no nested state setters)
  useEffect(() => {
    if (isFinished || isPaused) return

    const timer = window.setInterval(() => {
      const nextTime = Math.max(0, Number((timeLeftRef.current - 0.1).toFixed(1)))
      timeLeftRef.current = nextTime
      setTimeLeft(nextTime)

      if (nextTime <= 0) {
        window.clearInterval(timer)
        finishGame(scoreRef.current)
      }
    }, 100)

    return () => window.clearInterval(timer)
  }, [isFinished, isPaused, finishGame])

  const restartGame = useCallback(() => {
    audioService.playClick()
    clearAllTimeouts()
    drawQueueRef.current = []
    const nextBoard = createInitialBoard(getPool())
    commitBoard(nextBoard)

    scoreRef.current = 0
    comboRef.current = 0
    timeLeftRef.current = INITIAL_TIME
    lastMatchAtRef.current = 0

    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setMatchedCount(0)
    updateSelectedLeft(null)
    updateSelectedRight(null)
    setBonusToast(null)
    setIsNewRecord(false)
    setTimeLeft(INITIAL_TIME)
    setIsPaused(false)
    setIsFinished(false)
  }, [clearAllTimeouts, commitBoard, getPool, updateSelectedLeft, updateSelectedRight])

  const checkPair = useCallback(
    (lIdx: number, rIdx: number) => {
      const current = boardRef.current
      const lCard = current.left[lIdx]
      const rCard = current.right[rIdx]
      if (!lCard || !rCard || lCard.status !== 'idle' || rCard.status !== 'idle') return

      if (lCard.wordId === rCard.wordId) {
        // MATCHED!
        const now = performance.now()
        const withinComboWindow = lastMatchAtRef.current > 0 && now - lastMatchAtRef.current < 4200
        lastMatchAtRef.current = now

        const nextCombo = withinComboWindow ? comboRef.current + 1 : 1
        comboRef.current = nextCombo
        const multiplier = Math.min(5, 1 + Math.floor(nextCombo / 3))
        const gained = 50 * multiplier

        scoreRef.current += gained
        setScore(scoreRef.current)
        setCombo(nextCombo)
        setMaxCombo((prev) => Math.max(prev, nextCombo))
        setMatchedCount((prev) => prev + 1)
        updateSelectedLeft(null)
        updateSelectedRight(null)

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(25)
          } catch {}
        }
        audioService.playCombo(nextCombo)
        storageService.recordDailyActivity(true)

        // Bonus +3 seconds every 5 combo streak!
        if (nextCombo > 0 && nextCombo % 5 === 0) {
          const boosted = Math.min(90, Number((timeLeftRef.current + 3).toFixed(1)))
          timeLeftRef.current = boosted
          setTimeLeft(boosted)
          setBonusToast(`Combo x${nextCombo}! +3 giây`)
          scheduleTimeout(() => setBonusToast(null), 1300)
        }

        // Atomically mark matched green flash on both columns
        commitBoard({
          left: current.left.map((s, idx) => (idx === lIdx && s ? { ...s, status: 'matched' } : s)),
          right: current.right.map((s, idx) =>
            idx === rIdx && s ? { ...s, status: 'matched' } : s
          ),
        })

        // Clear matched slots after 210ms; atomically refill both columns when >= 2 slots empty!
        scheduleTimeout(() => {
          const snap = boardRef.current
          const nextL = snap.left.map((s, idx) =>
            idx === lIdx && s?.status === 'matched' ? null : s
          )
          const nextR = snap.right.map((s, idx) =>
            idx === rIdx && s?.status === 'matched' ? null : s
          )

          const emptyLeftIndices = nextL
            .map((s, idx) => (s === null ? idx : -1))
            .filter((idx) => idx !== -1)
          const emptyRightIndices = nextR
            .map((s, idx) => (s === null ? idx : -1))
            .filter((idx) => idx !== -1)

          const refillCount = Math.min(emptyLeftIndices.length, emptyRightIndices.length)

          if (refillCount >= 2) {
            const activeIds = new Set<string>()
            const activeTerms = new Set<string>()
            const activeDefs = new Set<string>()

            for (const s of nextL) {
              if (s) {
                activeIds.add(s.wordId)
                activeTerms.add(s.termKey)
                activeDefs.add(s.defKey)
              }
            }
            for (const s of nextR) {
              if (s) {
                activeIds.add(s.wordId)
                activeTerms.add(s.termKey)
                activeDefs.add(s.defKey)
              }
            }

            const freshWords = pullNextWords(refillCount, activeIds, activeTerms, activeDefs)
            const shuffledLeftWords = shuffle(freshWords)
            const shuffledRightWords = shuffle(freshWords)

            shuffledLeftWords.forEach((w, i) => {
              nextL[emptyLeftIndices[i]] = {
                wordId: w.id,
                termKey: w.term.trim().toLowerCase(),
                defKey: w.definition.trim().toLowerCase(),
                text: w.term,
                status: 'idle',
              }
            })

            shuffledRightWords.forEach((w, i) => {
              nextR[emptyRightIndices[i]] = {
                wordId: w.id,
                termKey: w.term.trim().toLowerCase(),
                defKey: w.definition.trim().toLowerCase(),
                text: w.definition,
                status: 'idle',
              }
            })
          }

          commitBoard({ left: nextL, right: nextR })
        }, 210)
      } else {
        // WRONG PAIR!
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([70, 40, 70])
          } catch {}
        }
        audioService.playErrorBuzz()
        comboRef.current = 0
        setCombo(0)
        updateSelectedLeft(null)
        updateSelectedRight(null)

        commitBoard({
          left: current.left.map((s, idx) => (idx === lIdx && s ? { ...s, status: 'wrong' } : s)),
          right: current.right.map((s, idx) => (idx === rIdx && s ? { ...s, status: 'wrong' } : s)),
        })

        scheduleTimeout(() => {
          const snap = boardRef.current
          commitBoard({
            left: snap.left.map((s, idx) =>
              idx === lIdx && s?.status === 'wrong' ? { ...s, status: 'idle' } : s
            ),
            right: snap.right.map((s, idx) =>
              idx === rIdx && s?.status === 'wrong' ? { ...s, status: 'idle' } : s
            ),
          })
        }, 350)
      }
    },
    [commitBoard, pullNextWords, scheduleTimeout, updateSelectedLeft, updateSelectedRight]
  )

  const handleSelectLeft = (idx: number) => {
    if (isFinished || isPaused) return
    const slot = boardRef.current.left[idx]
    if (!slot || slot.status !== 'idle') return

    audioService.playClick()
    if (selectedLeftRef.current === idx) {
      updateSelectedLeft(null)
      return
    }
    if (selectedRightRef.current !== null) {
      checkPair(idx, selectedRightRef.current)
    } else {
      updateSelectedLeft(idx)
    }
  }

  const handleSelectRight = (idx: number) => {
    if (isFinished || isPaused) return
    const slot = boardRef.current.right[idx]
    if (!slot || slot.status !== 'idle') return

    audioService.playClick()
    if (selectedRightRef.current === idx) {
      updateSelectedRight(null)
      return
    }
    if (selectedLeftRef.current !== null) {
      checkPair(selectedLeftRef.current, idx)
    } else {
      updateSelectedRight(idx)
    }
  }

  const timePercent = Math.min(100, (timeLeft / INITIAL_TIME) * 100)

  return (
    <div
      className="w-full flex-1 flex flex-col max-w-md mx-auto px-3.5 py-1.5 select-none relative"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            title="Thoát trò chơi"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {!isFinished && (
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                setIsPaused((p) => !p)
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400"
              title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

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
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2 relative">
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
        <div className="mb-1.5 py-1 px-3 rounded-full bg-emerald-500 text-white text-xs font-extrabold mx-auto shadow-md animate-bounce">
          {bonusToast}
        </div>
      )}

      {!isFinished ? (
        <div className="flex-1 flex flex-col relative">
          <div className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1.5 truncate">
            Chạm nối nhanh 1 ô Tiếng Anh với 1 ô Nghĩa Việt ({deckName})
          </div>

          {/* 2x5 Match Grid */}
          <div className="flex-1 grid grid-cols-2 gap-2 my-auto">
            {/* Left Column: English Terms */}
            <div className="flex flex-col gap-2">
              {board.left.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`l-empty-${idx}`}
                      className="flex-1 min-h-[50px] sm:min-h-[60px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/60"
                    />
                  )
                }

                const isSelected = selectedLeft === idx
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 hover:border-indigo-400'

                if (slot.status === 'matched') {
                  cardStyle = 'bg-emerald-500 text-white border-emerald-500 scale-95 opacity-80'
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
                    className={`flex-1 min-h-[50px] sm:min-h-[60px] p-2 rounded-2xl border-2 font-bold text-xs sm:text-sm flex items-center justify-center text-center shadow-2xs transition-all duration-150 break-words leading-snug ${cardStyle}`}
                  >
                    {slot.text}
                  </button>
                )
              })}
            </div>

            {/* Right Column: Vietnamese Definitions */}
            <div className="flex flex-col gap-2">
              {board.right.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`r-empty-${idx}`}
                      className="flex-1 min-h-[50px] sm:min-h-[60px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/60"
                    />
                  )
                }

                const isSelected = selectedRight === idx
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-emerald-400'

                if (slot.status === 'matched') {
                  cardStyle = 'bg-emerald-500 text-white border-emerald-500 scale-95 opacity-80'
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
                    className={`flex-1 min-h-[50px] sm:min-h-[60px] p-2 rounded-2xl border-2 font-medium text-xs flex items-center justify-center text-center shadow-2xs transition-all duration-150 leading-snug line-clamp-3 break-words ${cardStyle}`}
                  >
                    {slot.text}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Pause Overlay hides cards so timer can't be cheated */}
          {isPaused && (
            <div className="absolute inset-0 rounded-3xl bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fadeIn z-20">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3">
                <Pause className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Đang tạm dừng</h3>
              <p className="text-xs text-slate-400 mb-5">
                Còn {Math.ceil(timeLeft)} giây • Điểm hiện tại: <strong>{score.toLocaleString()}</strong>
              </p>
              <div className="w-full max-w-xs space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setIsPaused(false)
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Tiếp tục ghép từ</span>
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
        /* Summary Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mb-3">
            <Zap className="w-8 h-8" />
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
            Bạn đã ghép chuẩn <strong>{matchedCount} cặp từ</strong> với chuỗi Combo tối đa{' '}
            <strong>x{maxCombo}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-5">
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
