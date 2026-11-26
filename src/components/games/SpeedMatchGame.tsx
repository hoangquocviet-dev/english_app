import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Check,
  Clock,
  Flame,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Star,
  Trophy,
  Volume2,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { useChildModalBack } from '../../utils/useChildModalBack'
import { useWakeLock } from '../../utils/useWakeLock'

interface SpeedMatchGameProps {
  words: WordItem[]
  deckName: string
  onStudyMissedWords?: (words: WordItem[]) => void
  onBack: () => void
}

interface MatchCardSlot {
  word: WordItem
  wordId: string
  termKey: string
  defKey: string
  text: string
  status: 'idle' | 'matched' | 'wrong'
  pointsEarned?: number
  spawnSeq: number
}

interface BoardState {
  left: Array<MatchCardSlot | null>
  right: Array<MatchCardSlot | null>
}

const BOARD_ROWS = 5
const INITIAL_TIME = 60
const RIGHT_HOTKEYS = ['Q', 'W', 'E', 'R', 'T'] as const

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

// Shuffle right batch independently and avoid identical ordering when >= 2 items
function shuffleDistinctOrder<T extends { id: string }>(leftArr: T[]): T[] {
  if (leftArr.length < 2) return [...leftArr]
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = shuffle(leftArr)
    if (candidate.some((item, idx) => item.id !== leftArr[idx].id)) {
      return candidate
    }
  }
  return [...leftArr.slice(1), leftArr[0]]
}

function buildPlayablePool(words: WordItem[]): WordItem[] {
  const normalized = words
    .filter((w) => w.term.length <= 32)
    .map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 84) }))
  const base =
    normalized.length >= 8
      ? normalized
      : words.map((w) => ({ ...w, definition: formatArcadeMeaning(w.definition, 84) }))

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

  for (const iw of storageService.getWords()) {
    if (iw.term.length > 28) continue
    const formatted = { ...iw, definition: formatArcadeMeaning(iw.definition, 84) }
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
  const leftBatch = shuffle(batch)
  const rightBatch = shuffleDistinctOrder(leftBatch)

  const left: Array<MatchCardSlot | null> = leftBatch.map((w, i) => ({
    word: w,
    wordId: w.id,
    termKey: w.term.trim().toLowerCase(),
    defKey: w.definition.trim().toLowerCase(),
    text: w.term,
    status: 'idle',
    spawnSeq: i + 1,
  }))
  const right: Array<MatchCardSlot | null> = rightBatch.map((w, i) => ({
    word: w,
    wordId: w.id,
    termKey: w.term.trim().toLowerCase(),
    defKey: w.definition.trim().toLowerCase(),
    text: w.definition,
    status: 'idle',
    spawnSeq: i + 1,
  }))
  return { left, right }
}

export function SpeedMatchGame({
  words,
  deckName,
  onStudyMissedWords,
  onBack,
}: SpeedMatchGameProps) {
  const getPool = useCallback(() => buildPlayablePool(words), [words])

  const drawQueueRef = useRef<WordItem[]>([])
  const timeoutsRef = useRef<number[]>([])
  const spawnCounterRef = useRef(10)

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
  const [missedWords, setMissedWords] = useState<WordItem[]>([])
  const [hintsLeft, setHintsLeft] = useState(2)
  const [hintWordId, setHintWordId] = useState<string | null>(null)
  const [displaySeconds, setDisplaySeconds] = useState(INITIAL_TIME)
  const [bonusToast, setBonusToast] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['speed-match'] || 0
  )

  const timerBarRef = useRef<HTMLDivElement | null>(null)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const matchesRef = useRef(0)
  const timeLeftRef = useRef(INITIAL_TIME)
  const lastShownSecRef = useRef(INITIAL_TIME)
  const lastMatchAtRef = useRef(0)

  const syncTimerBarDom = useCallback((secondsRemaining: number) => {
    const el = timerBarRef.current
    if (!el) return
    const pct = Math.min(100, Math.max(0, (secondsRemaining / INITIAL_TIME) * 100))
    el.style.width = `${pct}%`
    const color =
      secondsRemaining <= 10
        ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.65)]'
        : secondsRemaining <= 25
        ? 'bg-amber-500'
        : 'bg-emerald-500'
    el.className = `h-full rounded-full transition-colors ${color}`
  }, [])

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

  const triggerHint = useCallback(() => {
    if (isFinished || isPaused || hintsLeft <= 0) return
    const idlePairs = boardRef.current.left.filter(
      (s): s is MatchCardSlot => s !== null && s.status === 'idle'
    )
    if (idlePairs.length === 0) return
    const chosen = idlePairs[Math.floor(Math.random() * idlePairs.length)]
    setHintsLeft((h) => Math.max(0, h - 1))
    setHintWordId(chosen.wordId)
    audioService.playPowerup()
    scheduleTimeout(() => {
      setHintWordId((cur) => (cur === chosen.wordId ? null : cur))
    }, 1800)
  }, [hintsLeft, isFinished, isPaused, scheduleTimeout])

  // 60fps Timer Bar + final countdown tick
  useEffect(() => {
    if (isFinished || isPaused) return

    let rafId = 0
    let lastNow = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000)
      lastNow = now

      const nextTime = Math.max(0, timeLeftRef.current - dt)
      timeLeftRef.current = nextTime
      syncTimerBarDom(nextTime)

      const ceilSec = Math.ceil(nextTime)
      if (ceilSec !== lastShownSecRef.current) {
        lastShownSecRef.current = ceilSec
        setDisplaySeconds(ceilSec)
        if (ceilSec > 0 && ceilSec <= 5) {
          audioService.playCountdownTick()
        }
      }

      if (nextTime <= 0) {
        finishGame(scoreRef.current)
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isFinished, isPaused, finishGame, syncTimerBarDom])

  const restartGame = useCallback(() => {
    audioService.playClick()
    clearAllTimeouts()
    drawQueueRef.current = []
    const nextBoard = createInitialBoard(getPool())
    commitBoard(nextBoard)

    scoreRef.current = 0
    comboRef.current = 0
    matchesRef.current = 0
    timeLeftRef.current = INITIAL_TIME
    lastShownSecRef.current = INITIAL_TIME
    lastMatchAtRef.current = 0

    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setMatchedCount(0)
    setMissedWords([])
    setHintsLeft(2)
    setHintWordId(null)
    updateSelectedLeft(null)
    updateSelectedRight(null)
    setBonusToast(null)
    setIsNewRecord(false)
    setDisplaySeconds(INITIAL_TIME)
    syncTimerBarDom(INITIAL_TIME)
    setIsPaused(false)
    setIsFinished(false)
  }, [clearAllTimeouts, commitBoard, getPool, syncTimerBarDom, updateSelectedLeft, updateSelectedRight])

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
        matchesRef.current += 1
        const multiplier = Math.min(5, 1 + Math.floor(nextCombo / 3))
        const gained = 50 * multiplier

        scoreRef.current += gained
        setScore(scoreRef.current)
        setCombo(nextCombo)
        setMaxCombo((prev) => Math.max(prev, nextCombo))
        setMatchedCount(matchesRef.current)
        setHintWordId((cur) => (cur === lCard.wordId ? null : cur))
        updateSelectedLeft(null)
        updateSelectedRight(null)

        if (matchesRef.current % 8 === 0) {
          setHintsLeft((h) => Math.min(3, h + 1))
        }

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(25)
          } catch {}
        }
        audioService.playCombo(nextCombo)
        storageService.recordDailyActivity(true)

        // Fever Bonus +3s every 5 combo!
        if (nextCombo > 0 && nextCombo % 5 === 0) {
          const boosted = Math.min(90, timeLeftRef.current + 3)
          timeLeftRef.current = boosted
          const ceilSec = Math.ceil(boosted)
          lastShownSecRef.current = ceilSec
          setDisplaySeconds(ceilSec)
          syncTimerBarDom(boosted)
          audioService.playPowerup()
          setBonusToast(`🔥 FEVER COMBO x${nextCombo}! +3 giây`)
          scheduleTimeout(() => setBonusToast(null), 1300)
        }

        commitBoard({
          left: current.left.map((s, idx) =>
            idx === lIdx && s ? { ...s, status: 'matched', pointsEarned: gained } : s
          ),
          right: current.right.map((s, idx) =>
            idx === rIdx && s ? { ...s, status: 'matched', pointsEarned: gained } : s
          ),
        })

        // Anti-exploit batch deal: refill as soon as >= 2 pairs are cleared (so newly dealt pairs shuffle across >=2 slots and cannot be blind-tapped!)
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
          const remainingActive = nextL.filter((s) => s !== null).length
          const threshold = remainingActive === 0 ? 1 : 2

          if (refillCount >= threshold) {
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
            const shuffledRightWords = shuffleDistinctOrder(shuffledLeftWords)

            shuffledLeftWords.forEach((w, i) => {
              const seq = ++spawnCounterRef.current
              nextL[emptyLeftIndices[i]] = {
                word: w,
                wordId: w.id,
                termKey: w.term.trim().toLowerCase(),
                defKey: w.definition.trim().toLowerCase(),
                text: w.term,
                status: 'idle',
                spawnSeq: seq,
              }
            })

            shuffledRightWords.forEach((w, i) => {
              const seq = ++spawnCounterRef.current
              nextR[emptyRightIndices[i]] = {
                word: w,
                wordId: w.id,
                termKey: w.term.trim().toLowerCase(),
                defKey: w.definition.trim().toLowerCase(),
                text: w.definition,
                status: 'idle',
                spawnSeq: seq,
              }
            })
          }

          commitBoard({ left: nextL, right: nextR })
        }, 220)
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
        setMissedWords((prev) =>
          prev.some((w) => w.id === lCard.word.id) ? prev : [...prev.slice(-3), lCard.word]
        )
        if (lCard.word.status === 'new') {
          storageService.updateWordStatus(lCard.word.id, 'learning', false)
        }
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
        }, 250)
      }
    },
    [commitBoard, pullNextWords, scheduleTimeout, syncTimerBarDom, updateSelectedLeft, updateSelectedRight]
  )

  const suppressClickUntilRef = useRef(0)
  const dragConnectRef = useRef<{ originSide: 'left' | 'right'; originIdx: number } | null>(null)
  const dragHoverRef = useRef<{ side: 'left' | 'right'; idx: number } | null>(null)
  const [dragHover, setDragHover] = useState<{ side: 'left' | 'right'; idx: number } | null>(null)

  useWakeLock(!isFinished && !isPaused)
  useChildModalBack(!isFinished && !isPaused, () => {
    setIsPaused(true)
  })

  const handleSelectLeft = useCallback(
    (idx: number) => {
      if (Date.now() < suppressClickUntilRef.current) return
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
    },
    [checkPair, isFinished, isPaused, updateSelectedLeft]
  )

  const handleSelectRight = useCallback(
    (idx: number) => {
      if (Date.now() < suppressClickUntilRef.current) return
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
    },
    [checkPair, isFinished, isPaused, updateSelectedRight]
  )

  const handleBoardTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isFinished || isPaused || e.touches.length === 0) return
    const el = (e.target as HTMLElement | null)?.closest('[data-match-side]')
    if (!el) return
    const side = el.getAttribute('data-match-side') as 'left' | 'right' | null
    const idx = Number(el.getAttribute('data-match-idx'))
    if ((side !== 'left' && side !== 'right') || Number.isNaN(idx)) return
    dragConnectRef.current = { originSide: side, originIdx: idx }
    dragHoverRef.current = null
  }

  const handleBoardTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const origin = dragConnectRef.current
    if (!origin || isFinished || isPaused || e.touches.length === 0) return
    const touch = e.touches[0]
    const hit = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest('[data-match-side]')
    if (!hit) {
      if (dragHoverRef.current) {
        dragHoverRef.current = null
        setDragHover(null)
      }
      return
    }
    const hitSide = hit.getAttribute('data-match-side') as 'left' | 'right' | null
    const hitIdx = Number(hit.getAttribute('data-match-idx'))
    if ((hitSide === 'left' || hitSide === 'right') && hitSide !== origin.originSide && !Number.isNaN(hitIdx)) {
      if (origin.originSide === 'left' && selectedLeftRef.current !== origin.originIdx) {
        updateSelectedLeft(origin.originIdx)
      } else if (origin.originSide === 'right' && selectedRightRef.current !== origin.originIdx) {
        updateSelectedRight(origin.originIdx)
      }
      if (dragHoverRef.current?.side !== hitSide || dragHoverRef.current?.idx !== hitIdx) {
        dragHoverRef.current = { side: hitSide, idx: hitIdx }
        setDragHover({ side: hitSide, idx: hitIdx })
      }
    } else if (dragHoverRef.current) {
      dragHoverRef.current = null
      setDragHover(null)
    }
  }

  const handleBoardTouchEnd = () => {
    const origin = dragConnectRef.current
    const hover = dragHoverRef.current
    dragConnectRef.current = null
    dragHoverRef.current = null
    if (hover) setDragHover(null)
    if (!origin || !hover || hover.side === origin.originSide || isFinished || isPaused) return

    suppressClickUntilRef.current = Date.now() + 400
    const lIdx = origin.originSide === 'left' ? origin.originIdx : hover.idx
    const rIdx = origin.originSide === 'right' ? origin.originIdx : hover.idx
    checkPair(lIdx, rIdx)
  }

  // Keyboard shortcuts (1-5 for English left, Q/W/E/R/T for Vietnamese right, H for Hint, P/Esc for Pause)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !isFinished) {
        setIsPaused(true)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (isFinished) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        setIsPaused((p) => !p)
        return
      }
      if (isPaused) return

      const k = e.key.toUpperCase()
      if (['1', '2', '3', '4', '5'].includes(k)) {
        e.preventDefault()
        handleSelectLeft(Number(k) - 1)
      } else if (RIGHT_HOTKEYS.includes(k as (typeof RIGHT_HOTKEYS)[number])) {
        e.preventDefault()
        handleSelectRight(RIGHT_HOTKEYS.indexOf(k as (typeof RIGHT_HOTKEYS)[number]))
      } else if (k === 'H') {
        e.preventDefault()
        triggerHint()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      clearAllTimeouts()
    }
  }, [isFinished, isPaused, handleSelectLeft, handleSelectRight, triggerHint, clearAllTimeouts])

  const isFever = combo >= 5

  return (
    <div
      className="w-full max-w-xl mx-auto my-auto px-3.5 py-2 flex flex-col select-none relative"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 -ml-1.5 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 active:scale-95"
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
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95"
              title={isPaused ? 'Tiếp tục (P)' : 'Tạm dừng (P)'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold tabular-nums ${
              displaySeconds <= 10
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-pulse border border-rose-500/30'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{displaySeconds}s</span>
          </div>

          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
            {score.toLocaleString()} đ
          </span>

          {combo >= 2 && (
            <span
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold ${
                isFever
                  ? 'bg-gradient-to-r from-emerald-500 to-amber-500 text-white shadow-xs'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <Flame className="w-3 h-3" />
              x{combo}
            </span>
          )}
        </div>

        {/* Radar Hint Button */}
        {!isFinished ? (
          <button
            type="button"
            disabled={hintsLeft <= 0 || isPaused}
            onClick={triggerHint}
            title="Radar Gợi ý 1 cặp đúng (Phím H)"
            className={`h-9 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all active:scale-95 ${
              hintsLeft > 0
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-400 opacity-50'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>{hintsLeft}</span>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Timer Bar */}
      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2.5 relative">
        <div
          ref={timerBarRef}
          className="h-full rounded-full bg-emerald-500"
          style={{ width: '100%' }}
        />
      </div>

      {bonusToast && (
        <div className="mb-2 py-1 px-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-extrabold mx-auto shadow-md animate-bounce">
          {bonusToast}
        </div>
      )}

      {!isFinished ? (
        <div className="flex flex-col relative">
          {/* Column Headers */}
          <div className="grid grid-cols-2 gap-2.5 mb-1.5 px-1">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <span>Từ Tiếng Anh</span>
              <span className="hidden sm:inline text-[10px] font-mono opacity-75">Phím 1–5</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span>Nghĩa Tiếng Việt</span>
              <span className="hidden sm:inline text-[10px] font-mono opacity-75">Phím Q–T</span>
            </div>
          </div>

          {/* Crisp Locked-Height 5x2 Arcade Tile Matrix (Supports 2-Tap OR 1-Stroke Thumb Swipe Across Columns!) */}
          <div
            className="grid grid-cols-2 gap-2.5 touch-none"
            onTouchStart={handleBoardTouchStart}
            onTouchMove={handleBoardTouchMove}
            onTouchEnd={handleBoardTouchEnd}
            onTouchCancel={handleBoardTouchEnd}
          >
            {/* Left Column: English Terms */}
            <div className="grid grid-rows-5 gap-2">
              {board.left.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`l-charge-${idx}`}
                      className="h-[62px] sm:h-[68px] rounded-2xl bg-emerald-500/8 dark:bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center gap-1.5 text-emerald-600/70 dark:text-emerald-400/70 text-xs font-bold"
                    >
                      <Check className="w-4 h-4" />
                      <span>Đã ghép</span>
                    </div>
                  )
                }

                const isSelected =
                  selectedLeft === idx || (dragHover?.side === 'left' && dragHover.idx === idx)
                const isHinted = hintWordId === slot.wordId
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-950 text-slate-900 dark:text-slate-100 hover:border-indigo-400 dark:hover:border-indigo-500'

                if (slot.status === 'matched') {
                  cardStyle =
                    'bg-emerald-500 border-emerald-700 text-white scale-95 shadow-md shadow-emerald-500/25'
                } else if (slot.status === 'wrong') {
                  cardStyle =
                    'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 animate-shake'
                } else if (isSelected) {
                  cardStyle =
                    'bg-indigo-600 border-indigo-800 text-white ring-2 ring-indigo-400/50 -translate-y-0.5 shadow-md shadow-indigo-600/25'
                } else if (isHinted) {
                  cardStyle =
                    'bg-amber-500/15 border-amber-400 text-amber-700 dark:text-amber-200 ring-2 ring-amber-400/60 animate-pulse'
                }

                return (
                  <button
                    key={`l-${idx}-${slot.spawnSeq}`}
                    type="button"
                    data-match-side={slot.status === 'idle' ? 'left' : undefined}
                    data-match-idx={slot.status === 'idle' ? idx : undefined}
                    onClick={() => handleSelectLeft(idx)}
                    className={`relative h-[62px] sm:h-[68px] px-2.5 py-1.5 rounded-2xl border-2 border-b-4 font-extrabold text-xs sm:text-sm flex items-center justify-center text-center transition-all duration-150 active:translate-y-0.5 break-words leading-tight animate-popIn ${cardStyle}`}
                  >
                    <span className="hidden sm:flex absolute top-1.5 left-2 w-4 h-4 rounded text-[10px] font-mono font-bold items-center justify-center opacity-45">
                      {idx + 1}
                    </span>
                    <span className="line-clamp-2 px-1">{slot.text}</span>
                    {slot.status === 'matched' && slot.pointsEarned && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black shadow-xs animate-floatUp">
                        +{slot.pointsEarned}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Right Column: Vietnamese Definitions */}
            <div className="grid grid-rows-5 gap-2">
              {board.right.map((slot, idx) => {
                if (!slot) {
                  return (
                    <div
                      key={`r-charge-${idx}`}
                      className="h-[62px] sm:h-[68px] rounded-2xl bg-emerald-500/8 dark:bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center gap-1.5 text-emerald-600/70 dark:text-emerald-400/70 text-xs font-bold"
                    >
                      <Check className="w-4 h-4" />
                      <span>Đã ghép</span>
                    </div>
                  )
                }

                const isSelected =
                  selectedRight === idx || (dragHover?.side === 'right' && dragHover.idx === idx)
                const isHinted = hintWordId === slot.wordId
                let cardStyle =
                  'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-950 text-slate-700 dark:text-slate-200 hover:border-emerald-400 dark:hover:border-emerald-500'

                if (slot.status === 'matched') {
                  cardStyle =
                    'bg-emerald-500 border-emerald-700 text-white scale-95 shadow-md shadow-emerald-500/25'
                } else if (slot.status === 'wrong') {
                  cardStyle =
                    'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 animate-shake'
                } else if (isSelected) {
                  cardStyle =
                    'bg-emerald-600 border-emerald-800 text-white ring-2 ring-emerald-400/50 -translate-y-0.5 shadow-md shadow-emerald-600/25'
                } else if (isHinted) {
                  cardStyle =
                    'bg-amber-500/15 border-amber-400 text-amber-700 dark:text-amber-200 ring-2 ring-amber-400/60 animate-pulse'
                }

                return (
                  <button
                    key={`r-${idx}-${slot.spawnSeq}`}
                    type="button"
                    data-match-side={slot.status === 'idle' ? 'right' : undefined}
                    data-match-idx={slot.status === 'idle' ? idx : undefined}
                    onClick={() => handleSelectRight(idx)}
                    className={`relative h-[62px] sm:h-[68px] px-2.5 py-1.5 rounded-2xl border-2 border-b-4 font-semibold text-[11.5px] sm:text-xs flex items-center justify-center text-center transition-all duration-150 active:translate-y-0.5 leading-snug break-words animate-popIn ${cardStyle}`}
                  >
                    <span className="hidden sm:flex absolute top-1.5 left-2 w-4 h-4 rounded text-[10px] font-mono font-bold items-center justify-center opacity-45">
                      {RIGHT_HOTKEYS[idx]}
                    </span>
                    <span className="line-clamp-3 sm:pl-2">{slot.text}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-2.5 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate">
            Chạm hoặc vuốt nối cặp từ • {deckName}
          </div>

          {/* Pause Overlay */}
          {isPaused && (
            <div className="absolute inset-0 rounded-3xl bg-slate-950/88 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-fadeIn z-20">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3">
                <Pause className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Tạm dừng Ghép Từ</h3>
              <p className="text-xs text-slate-400 mb-5">
                Còn <strong>{displaySeconds}s</strong> • Điểm: <strong>{score.toLocaleString()}</strong>
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
        <div className="flex flex-col items-center justify-center p-5 text-center animate-fadeIn bg-white dark:bg-slate-800/80 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
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
            Bạn đã ghép chuẩn <strong>{matchedCount} cặp từ</strong> • Chuỗi Combo tối đa{' '}
            <strong>x{maxCombo}</strong>
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-5">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
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
            <div className="w-full max-w-xs mb-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-left space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500">
                Từ vừa nối nhầm ({missedWords.length})
              </div>
              {missedWords.map((mw) => (
                <div key={mw.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => void audioService.speak(mw.term)}
                    className="min-w-0 flex-1 text-left active:opacity-75"
                  >
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {mw.term}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 block truncate text-[11px]">
                      {formatArcadeMeaning(mw.definition, 60)}
                    </span>
                  </button>
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
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-92 ${
                        mw.starred
                          ? 'text-amber-500 bg-amber-500/12'
                          : 'bg-slate-200/60 dark:bg-slate-800 text-slate-400 hover:text-amber-500'
                      }`}
                      title="Đánh dấu sao từ này"
                    >
                      <Star className={`w-4 h-4 ${mw.starred ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void audioService.speak(mw.term)}
                      className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center active:scale-92 transition-transform"
                      title="Nghe phát âm"
                    >
                      <Volume2 className="w-4 h-4" />
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
                <Zap className="w-3.5 h-3.5" />
                <span>Ôn kỹ {missedWords.length} từ vừa nối nhầm ngay</span>
              </button>
            )}
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
