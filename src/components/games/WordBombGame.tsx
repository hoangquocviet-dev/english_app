import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Bomb,
  Delete,
  Flame,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Trophy,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface WordBombGameProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface BombLetterTile {
  id: string
  char: string
  used: boolean
}

interface BombState {
  word: WordItem
  meaning: string
  slots: Array<{ targetChar: string; filledChar: string | null; locked: boolean; tileId?: string }>
  pool: BombLetterTile[]
  durationSec: number
}

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

function buildBombPool(words: WordItem[]): WordItem[] {
  // Single words or crisp 2-word terms (3..14 chars) make the best fast-paced bomb defusals
  const ideal = words.filter((w) => {
    const t = w.term.trim()
    return t.length >= 3 && t.length <= 14 && /^[a-zA-Z\s-]+$/.test(t)
  })
  if (ideal.length >= 8) return ideal

  const fallback = [...ideal]
  const seen = new Set(fallback.map((w) => w.term.toLowerCase()))
  for (const iw of storageService.getWords()) {
    const t = iw.term.trim()
    if (t.length >= 3 && t.length <= 12 && /^[a-zA-Z\s-]+$/.test(t) && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      fallback.push(iw)
    }
    if (fallback.length >= 18) break
  }
  return fallback.length > 0 ? fallback : words
}

function createBombForWord(word: WordItem, waveNum: number): BombState {
  const cleanTerm = word.term.trim()
  const chars = cleanTerm.split('')

  // Pre-fill non-alphanumeric chars + smart anchor letters on longer words so pacing stays thrilling
  const alphaIndices = chars
    .map((c, idx) => (/[a-zA-Z]/.test(c) ? idx : -1))
    .filter((idx) => idx !== -1)

  const prefilledSet = new Set<number>()
  if (alphaIndices.length >= 5) {
    prefilledSet.add(alphaIndices[0])
  }
  if (alphaIndices.length >= 8) {
    prefilledSet.add(alphaIndices[Math.floor(alphaIndices.length / 2)])
  }
  if (alphaIndices.length >= 11) {
    prefilledSet.add(alphaIndices[alphaIndices.length - 1])
  }

  const slots = chars.map((ch, idx) => {
    const isSymbol = !/[a-zA-Z]/.test(ch)
    const isLocked = isSymbol || prefilledSet.has(idx)
    return {
      targetChar: ch,
      filledChar: isLocked ? ch : null,
      locked: isLocked,
    }
  })

  const missingChars = slots
    .filter((s) => !s.locked)
    .map((s, idx) => ({
      id: `tile-${idx}-${s.targetChar}`,
      char: s.targetChar.toLowerCase(),
      used: false,
    }))

  // Add 1-2 decoy letters on higher waves to prevent mindless tapping of the last tile
  const decoys: BombLetterTile[] = []
  const alphabet = 'eariotnslcudpmhgbfywkv'
  const decoyCount = waveNum >= 4 ? 2 : 1
  for (let i = 0; i < decoyCount; i++) {
    const ch = alphabet[Math.floor(Math.random() * alphabet.length)]
    decoys.push({
      id: `decoy-${i}-${ch}`,
      char: ch,
      used: false,
    })
  }

  let shuffledPool = shuffle([...missingChars, ...decoys])
  if (
    shuffledPool.length > 2 &&
    shuffledPool.slice(0, missingChars.length).every((t, i) => t.char === missingChars[i]?.char)
  ) {
    shuffledPool = [...shuffledPool.slice(1), shuffledPool[0]]
  }

  const toFillCount = missingChars.length
  const baseSec = Math.max(7.0, 11.5 - Math.min(3.5, (waveNum - 1) * 0.3))
  const durationSec = Number((baseSec + toFillCount * 0.65).toFixed(1))

  return {
    word,
    meaning: formatArcadeMeaning(word.definition, 92),
    slots,
    pool: shuffledPool,
    durationSec,
  }
}

export function WordBombGame({ words, deckName, onBack }: WordBombGameProps) {
  const getPool = useCallback(() => buildBombPool(words), [words])
  const queueRef = useRef<WordItem[]>([])

  const pullNextWord = useCallback(
    (prevId?: string): WordItem => {
      if (queueRef.current.length === 0) {
        queueRef.current = shuffle(getPool())
      }
      if (queueRef.current.length > 1 && queueRef.current[queueRef.current.length - 1].id === prevId) {
        const popped = queueRef.current.pop()!
        queueRef.current.unshift(popped)
      }
      return queueRef.current.pop()!
    },
    [getPool]
  )

  const [bomb, setBomb] = useState<BombState>(() => createBombForWord(pullNextWord(), 1))
  const bombRef = useRef<BombState>(bomb)
  const commitBomb = useCallback((next: BombState) => {
    bombRef.current = next
    setBomb(next)
  }, [])

  const [wave, setWave] = useState(1)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(1)
  const [defusedCount, setDefusedCount] = useState(0)
  const [lives, setLives] = useState(3)
  const [cutters, setCutters] = useState(2)
  const [status, setStatus] = useState<'ticking' | 'defused' | 'exploded'>('ticking')
  const [wrongSpark, setWrongSpark] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(bomb.durationSec)
  const [missedWords, setMissedWords] = useState<WordItem[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['word-bomb'] || 0
  )

  const fuseBarRef = useRef<HTMLDivElement | null>(null)
  const remainingSecRef = useRef(bomb.durationSec)
  const lastTenthsRef = useRef(Math.round(bomb.durationSec * 10))
  const lastTickSecRef = useRef(Math.ceil(bomb.durationSec))
  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const waveRef = useRef(1)
  const comboRef = useRef(1)
  const lockedRef = useRef(false)
  const timerIdRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }
  }, [])

  const syncFuseDom = useCallback((rem: number, total: number) => {
    const el = fuseBarRef.current
    if (!el) return
    const pct = Math.min(100, Math.max(0, (rem / Math.max(1, total)) * 100))
    el.style.width = `${pct}%`
    const color =
      pct <= 30
        ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]'
        : pct <= 60
        ? 'bg-amber-500'
        : 'bg-cyan-400'
    el.className = `h-full rounded-full ${color}`
  }, [])

  const finishGame = useCallback(
    (finalScore: number) => {
      clearTimer()
      setIsPaused(false)
      setIsGameOver(true)
      const isNew = storageService.saveHighScore('word-bomb', finalScore)
      setIsNewRecord(isNew)
      setBestScore(storageService.getHighScores()['word-bomb'] || finalScore)
      if (isNew && finalScore > 0) {
        audioService.playSuccessChime()
        try {
          confetti({ particleCount: 65, spread: 70, origin: { y: 0.6 } })
        } catch {}
      }
    },
    [clearTimer]
  )

  const spawnNextBomb = useCallback(
    (nextWave: number, prevWordId: string) => {
      const nextWord = pullNextWord(prevWordId)
      const nextBomb = createBombForWord(nextWord, nextWave)
      remainingSecRef.current = nextBomb.durationSec
      lastTenthsRef.current = Math.round(nextBomb.durationSec * 10)
      lastTickSecRef.current = Math.ceil(nextBomb.durationSec)
      waveRef.current = nextWave

      commitBomb(nextBomb)
      setWave(nextWave)
      setStatus('ticking')
      setWrongSpark(false)
      setSecondsLeft(nextBomb.durationSec)
      syncFuseDom(nextBomb.durationSec, nextBomb.durationSec)
      lockedRef.current = false
    },
    [commitBomb, pullNextWord, syncFuseDom]
  )

  const handleBombDefused = useCallback(() => {
    if (lockedRef.current) return
    lockedRef.current = true
    const cur = bombRef.current

    const timeBonus = Math.round(remainingSecRef.current * 8)
    const gained = (90 + timeBonus) * comboRef.current
    const nextCombo = Math.min(6, comboRef.current + 1)

    scoreRef.current += gained
    comboRef.current = nextCombo
    setScore(scoreRef.current)
    setCombo(nextCombo)
    setDefusedCount((d) => {
      const nextD = d + 1
      if (nextD % 4 === 0) {
        setCutters((c) => Math.min(3, c + 1))
        audioService.playPowerup()
      } else {
        audioService.playCombo(nextCombo)
      }
      return nextD
    })
    setStatus('defused')
    audioService.speakAuto(cur.word.term, 0.95)
    storageService.recordDailyActivity(true)

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25)
      } catch {}
    }

    clearTimer()
    timerIdRef.current = window.setTimeout(() => {
      timerIdRef.current = null
      spawnNextBomb(waveRef.current + 1, cur.word.id)
    }, 520)
  }, [clearTimer, spawnNextBomb])

  const handleBombExploded = useCallback(() => {
    if (lockedRef.current || isGameOver) return
    lockedRef.current = true
    const cur = bombRef.current
    syncFuseDom(0, cur.durationSec)
    setSecondsLeft(0)
    setStatus('exploded')

    // Reveal full word on explosion so player learns it
    commitBomb({
      ...cur,
      slots: cur.slots.map((s) => ({ ...s, filledChar: s.targetChar })),
    })

    setMissedWords((prev) =>
      prev.some((w) => w.id === cur.word.id) ? prev : [...prev.slice(-3), cur.word]
    )

    audioService.playExplosion(false)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 40, 100])
      } catch {}
    }

    comboRef.current = 1
    setCombo(1)
    const nextLives = livesRef.current - 1
    livesRef.current = nextLives
    setLives(nextLives)

    clearTimer()
    timerIdRef.current = window.setTimeout(() => {
      timerIdRef.current = null
      if (nextLives <= 0) {
        finishGame(scoreRef.current)
      } else {
        spawnNextBomb(waveRef.current + 1, cur.word.id)
      }
    }, 900)
  }, [clearTimer, commitBomb, finishGame, isGameOver, spawnNextBomb, syncFuseDom])

  // 60fps Fuse Countdown Loop
  useEffect(() => {
    if (isGameOver || isPaused) return

    let rafId = 0
    let lastNow = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000)
      lastNow = now

      if (!lockedRef.current) {
        const nextRem = Math.max(0, remainingSecRef.current - dt)
        remainingSecRef.current = nextRem
        syncFuseDom(nextRem, bombRef.current.durationSec)

        const tenths = Math.ceil(nextRem * 10)
        if (tenths !== lastTenthsRef.current) {
          lastTenthsRef.current = tenths
          setSecondsLeft(Number((tenths / 10).toFixed(1)))
        }

        const wholeSec = Math.ceil(nextRem)
        if (wholeSec !== lastTickSecRef.current) {
          lastTickSecRef.current = wholeSec
          if (wholeSec > 0 && wholeSec <= 3) {
            audioService.playCountdownTick()
          }
        }

        if (nextRem <= 0) {
          handleBombExploded()
          return
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isGameOver, isPaused, syncFuseDom, handleBombExploded])

  const attemptInputLetter = useCallback(
    (charInput: string, specificTileId?: string) => {
      if (lockedRef.current || isPaused || isGameOver) return
      const cur = bombRef.current
      const nextSlotIdx = cur.slots.findIndex((s) => !s.locked && s.filledChar === null)
      if (nextSlotIdx === -1) return

      const targetChar = cur.slots[nextSlotIdx].targetChar
      if (charInput.toLowerCase() === targetChar.toLowerCase()) {
        // Correct wire cut!
        const tileIdx = specificTileId
          ? cur.pool.findIndex((t) => t.id === specificTileId && !t.used)
          : cur.pool.findIndex((t) => !t.used && t.char.toLowerCase() === charInput.toLowerCase())

        const nextPool = cur.pool.map((t, i) => (i === tileIdx ? { ...t, used: true } : t))
        const nextSlots = cur.slots.map((s, i) =>
          i === nextSlotIdx
            ? {
                ...s,
                filledChar: s.targetChar,
                tileId: tileIdx >= 0 ? cur.pool[tileIdx].id : undefined,
              }
            : s
        )
        const updated = { ...cur, slots: nextSlots, pool: nextPool }
        commitBomb(updated)
        audioService.playHitTick()

        if (nextSlots.every((s) => s.filledChar !== null)) {
          handleBombDefused()
        }
      } else {
        // Wrong letter spark (no instant heart loss, just tactile buzz & shake!)
        audioService.playErrorBuzz()
        setWrongSpark(true)
        window.setTimeout(() => setWrongSpark(false), 260)
      }
    },
    [commitBomb, handleBombDefused, isGameOver, isPaused]
  )

  const handleBackspace = useCallback(() => {
    if (lockedRef.current || isPaused || isGameOver) return
    const cur = bombRef.current
    let removeIdx = -1
    for (let i = cur.slots.length - 1; i >= 0; i--) {
      if (!cur.slots[i].locked && cur.slots[i].filledChar !== null) {
        removeIdx = i
        break
      }
    }
    if (removeIdx === -1) return
    const releasedTileId = cur.slots[removeIdx].tileId
    const nextSlots = cur.slots.map((s, i) =>
      i === removeIdx ? { ...s, filledChar: null, tileId: undefined } : s
    )
    const nextPool = cur.pool.map((t) => (t.id === releasedTileId ? { ...t, used: false } : t))
    audioService.playClick()
    commitBomb({ ...cur, slots: nextSlots, pool: nextPool })
  }, [commitBomb, isGameOver, isPaused])

  const handleUseWireCutter = useCallback(() => {
    if (lockedRef.current || isPaused || isGameOver || cutters <= 0) return
    const cur = bombRef.current
    const emptyIndices = cur.slots
      .map((s, idx) => (!s.locked && s.filledChar === null ? idx : -1))
      .filter((idx) => idx !== -1)
    if (emptyIndices.length === 0) return

    setCutters((c) => Math.max(0, c - 1))
    audioService.playPowerup()

    const revealTargets = emptyIndices.slice(0, 2)
    const nextPool = [...cur.pool]
    const nextSlots = cur.slots.map((s, idx) => {
      if (!revealTargets.includes(idx)) return s
      const pIdx = nextPool.findIndex(
        (t) => !t.used && t.char.toLowerCase() === s.targetChar.toLowerCase()
      )
      if (pIdx !== -1) {
        nextPool[pIdx] = { ...nextPool[pIdx], used: true }
      }
      return {
        ...s,
        filledChar: s.targetChar,
        locked: true,
      }
    })

    commitBomb({ ...cur, slots: nextSlots, pool: nextPool })
    if (nextSlots.every((s) => s.filledChar !== null)) {
      handleBombDefused()
    }
  }, [commitBomb, cutters, handleBombDefused, isGameOver, isPaused])

  // Keyboard Typing + Pause + Tab Wire-Cutter
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !isGameOver && !lockedRef.current) {
        setIsPaused(true)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (isGameOver) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsPaused((p) => !p)
        return
      }
      if (isPaused || lockedRef.current) return

      if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        handleUseWireCutter()
      } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        attemptInputLetter(e.key)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      clearTimer()
    }
  }, [isGameOver, isPaused, attemptInputLetter, handleBackspace, handleUseWireCutter, clearTimer])

  const restartGame = () => {
    audioService.playClick()
    clearTimer()
    queueRef.current = []
    scoreRef.current = 0
    livesRef.current = 3
    waveRef.current = 1
    comboRef.current = 1
    lockedRef.current = false

    const first = createBombForWord(pullNextWord(), 1)
    remainingSecRef.current = first.durationSec
    lastTenthsRef.current = Math.round(first.durationSec * 10)
    lastTickSecRef.current = Math.ceil(first.durationSec)

    commitBomb(first)
    setWave(1)
    setScore(0)
    setCombo(1)
    setDefusedCount(0)
    setLives(3)
    setCutters(2)
    setMissedWords([])
    setStatus('ticking')
    setWrongSpark(false)
    setSecondsLeft(first.durationSec)
    syncFuseDom(first.durationSec, first.durationSec)
    setIsNewRecord(false)
    setIsPaused(false)
    setIsGameOver(false)
  }

  const nextActiveSlotIdx = bomb.slots.findIndex((s) => !s.locked && s.filledChar === null)
  const isUrgent = secondsLeft <= 3.0 && status === 'ticking'

  // Group slot indices by space-separated words so multi-word phrases never break mid-word
  const wordGroups: number[][] = []
  let curGroup: number[] = []
  bomb.slots.forEach((s, idx) => {
    if (s.targetChar === ' ') {
      if (curGroup.length > 0) {
        wordGroups.push(curGroup)
        curGroup = []
      }
    } else {
      curGroup.push(idx)
    }
  })
  if (curGroup.length > 0) wordGroups.push(curGroup)
  const maxWordLen = Math.max(1, ...wordGroups.map((g) => g.length))

  return (
    <div
      className="w-full max-w-md mx-auto my-auto px-3.5 py-2 flex flex-col select-none relative"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-2 gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              audioService.stopSpeech()
              onBack()
            }}
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
              className="p-2 rounded-lg text-slate-500 hover:text-amber-500"
              title={isPaused ? 'Tiếp tục (Esc)' : 'Tạm dừng (Esc)'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            Bom #{wave}
          </span>
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
            {score.toLocaleString()} đ
          </span>
          {combo > 1 && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-extrabold">
              <Flame className="w-3 h-3" />
              x{combo}
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
          {/* Fuse Timer Header */}
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 px-1">
            <span className="text-slate-400 uppercase tracking-wider text-[11px] truncate">
              Dây cháy chậm • {deckName}
            </span>
            <span
              className={`tabular-nums font-extrabold ${
                isUrgent ? 'text-rose-500 animate-pulse' : 'text-cyan-700 dark:text-cyan-400'
              }`}
            >
              {secondsLeft.toFixed(1)}s
            </span>
          </div>

          <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              ref={fuseBarRef}
              className="h-full rounded-full bg-cyan-400"
              style={{ width: '100%' }}
            />
          </div>

          {/* Cyber Time-Bomb Core Card */}
          <div
            className={`rounded-3xl p-4 sm:p-5 border-2 shadow-xl transition-all text-center relative ${
              status === 'defused'
                ? 'bg-emerald-500/15 border-emerald-500'
                : status === 'exploded'
                ? 'bg-rose-500/20 border-rose-500 animate-shake'
                : wrongSpark
                ? 'bg-slate-900 border-rose-500 animate-shake text-white'
                : isUrgent
                ? 'bg-slate-900 border-rose-500/70 shadow-rose-500/20 text-white'
                : 'bg-slate-900 border-cyan-500/40 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400 whitespace-nowrap">
                <Bomb className={`w-3.5 h-3.5 shrink-0 ${isUrgent ? 'animate-bounce text-rose-400' : ''}`} />
                <span>
                  {status === 'defused'
                    ? 'ĐÃ GỠ BOM!'
                    : status === 'exploded'
                    ? 'PHÁT NỔ! -1 TIM'
                    : 'CẮT DÂY THÁO NGÒI'}
                </span>
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={cutters <= 0 || status !== 'ticking'}
                  onClick={handleUseWireCutter}
                  title="Kìm cắt dây: Mở giúp 2 chữ cái (Phím Tab)"
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap transition-all active:scale-95 ${
                    cutters > 0
                      ? 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/40'
                      : 'bg-slate-800 text-slate-500 opacity-50'
                  }`}
                >
                  <Scissors className="w-3 h-3 shrink-0" />
                  <span>Cắt dây ({cutters})</span>
                </button>

                <button
                  type="button"
                  onClick={() => audioService.speak(bomb.word.term, 0.9)}
                  title="Nghe gợi ý phát âm"
                  className="p-1.5 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/40 text-cyan-300 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-base sm:text-lg font-extrabold text-white leading-snug break-words px-1">
              {bomb.meaning}
            </p>
            {bomb.word.ipa && (
              <p className="text-xs font-mono text-cyan-300/80 mt-1">{bomb.word.ipa}</p>
            )}

            {/* Bomb Wire Letter Slots Grouped by Word (Zero mid-word orphan wrapping!) */}
            <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 mt-4 mb-1">
              {wordGroups.map((group, gIdx) => (
                <div key={gIdx} className="inline-flex items-center gap-1">
                  {group.map((idx) => {
                    const slot = bomb.slots[idx]
                    if (!/[a-zA-Z]/.test(slot.targetChar)) {
                      return (
                        <span key={idx} className="px-0.5 text-base font-black text-slate-400">
                          {slot.targetChar}
                        </span>
                      )
                    }

                    const isCurrentCursor = idx === nextActiveSlotIdx && status === 'ticking'
                    const slotSize =
                      maxWordLen >= 11
                        ? 'w-6 h-8 text-xs sm:w-7 sm:h-9 sm:text-sm'
                        : maxWordLen >= 9
                        ? 'w-7 h-9 text-sm sm:w-8 sm:h-10 sm:text-base'
                        : 'w-8 h-10 sm:w-9 sm:h-11 text-base sm:text-lg'

                    return (
                      <div
                        key={idx}
                        className={`${slotSize} rounded-xl font-black uppercase flex items-center justify-center border-2 transition-all ${
                          status === 'defused'
                            ? 'bg-emerald-500 border-emerald-400 text-white scale-105'
                            : status === 'exploded'
                            ? 'bg-rose-600 border-rose-400 text-white'
                            : slot.filledChar
                            ? slot.locked
                              ? 'bg-slate-800 border-slate-600 text-amber-300'
                              : 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                            : isCurrentCursor
                            ? 'bg-indigo-950/90 border-cyan-400 ring-2 ring-cyan-400/40 animate-pulse'
                            : 'bg-slate-950/70 border-slate-700 border-dashed text-slate-500'
                        }`}
                      >
                        {slot.filledChar || ''}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 3D Tactile Scrambled Letter Keys */}
          <div className="mt-3.5 bg-white dark:bg-slate-800/80 rounded-3xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {bomb.pool.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  disabled={tile.used || status !== 'ticking'}
                  onClick={() => attemptInputLetter(tile.char, tile.id)}
                  className={`w-11 h-12 rounded-xl font-black text-lg uppercase flex items-center justify-center transition-all ${
                    tile.used
                      ? 'bg-slate-100 dark:bg-slate-900/50 text-transparent border border-dashed border-slate-200 dark:border-slate-800 scale-90'
                      : 'bg-slate-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 text-slate-900 dark:text-white border-2 border-slate-300 dark:border-slate-950 border-b-4 active:border-b-2 active:translate-y-0.5 shadow-xs'
                  }`}
                >
                  {tile.char}
                </button>
              ))}

              <button
                type="button"
                disabled={status !== 'ticking'}
                onClick={handleBackspace}
                title="Xóa 1 chữ (Backspace)"
                className="h-12 px-3 rounded-xl bg-slate-200/80 dark:bg-slate-700/80 hover:bg-rose-500/20 text-slate-600 dark:text-slate-200 border-2 border-slate-300 dark:border-slate-950 border-b-4 active:border-b-2 active:translate-y-0.5 flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-2.5 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Gõ trực tiếp bàn phím hoặc chạm chữ • Phím Tab để cắt dây gợi ý</span>
            </div>
          </div>

          {/* Pause Overlay */}
          {isPaused && (
            <div className="absolute inset-0 rounded-3xl bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fadeIn z-20">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-3">
                <Pause className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Tạm dừng Gỡ Bom</h3>
              <p className="text-xs text-slate-400 mb-5">
                Bom #{wave} • Điểm: <strong>{score.toLocaleString()}</strong>
              </p>
              <div className="w-full max-w-xs space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setIsPaused(false)
                  }}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Tiếp tục gỡ bom</span>
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
        /* Game Over Summary + Missed Words Review */
        <div className="flex flex-col items-center justify-center p-5 text-center animate-fadeIn bg-white dark:bg-slate-800/85 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
          <div className="w-15 h-15 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mb-2.5">
            <Bomb className="w-8 h-8" />
          </div>

          {isNewRecord && (
            <span className="px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-1">
              Kỷ lục mới!
            </span>
          )}

          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Kết thúc Gỡ Bom!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Đã tháo ngòi thành công <strong>{defusedCount} quả bom</strong> từ vựng
          </p>

          <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-amber-500">{score.toLocaleString()}</div>
              <div className="text-xs text-slate-400">Tổng điểm</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xl font-extrabold text-indigo-500 flex items-center justify-center gap-1">
                <Trophy className="w-4 h-4" />
                <span>{bestScore.toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400">Kỷ lục cao nhất</div>
            </div>
          </div>

          {missedWords.length > 0 && (
            <div className="w-full max-w-xs mb-4 text-left bg-slate-50 dark:bg-slate-900/70 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500">
                Từ làm nổ bom (Chạm 🔊 để nhớ ngay)
              </div>
              {missedWords.map((mw) => (
                <div key={mw.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <div className="min-w-0">
                    <span className="font-extrabold text-slate-900 dark:text-white">{mw.term}</span>
                    <span className="text-slate-500 dark:text-slate-400 block truncate text-[11px]">
                      {formatArcadeMeaning(mw.definition, 60)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => audioService.speak(mw.term, 0.9)}
                    className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="w-full max-w-xs space-y-2">
            <button
              type="button"
              onClick={restartGame}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Vào tháo bom tiếp</span>
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
