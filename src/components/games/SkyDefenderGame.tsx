import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Crosshair,
  Flame,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Trophy,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordItem } from '../../types'
import { formatArcadeMeaning } from '../../utils/arcadeText'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface SkyDefenderGameProps {
  words: WordItem[]
  deckName: string
  onBack: () => void
}

interface EnemyPlane {
  id: number
  lane: number
  baseX: number
  x: number
  y: number
  speed: number
  swayPhase: number
  word: WordItem
  isCorrect: boolean
  hp: number
  maxHp: number
  hitFlash: number
}

interface LaserBolt {
  x: number
  y: number
  vy: number
  overdrive: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

interface Shockwave {
  x: number
  y: number
  radius: number
  maxRadius: number
  life: number
  maxLife: number
  color: string
}

interface FloatingText {
  x: number
  y: number
  text: string
  color: string
  life: number
}

interface Star {
  x: number
  y: number
  size: number
  speed: number
  alpha: number
}

interface LaneOptionUI {
  lane: number
  term: string
}

const LANE_RATIOS = [0.18, 0.5, 0.82] as const
const SHIELD_CHARGE_NEEDED = 4

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function SkyDefenderGame({ words, deckName, onBack }: SkyDefenderGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [combo, setCombo] = useState(1)
  const [lives, setLives] = useState(3)
  const [kills, setKills] = useState(0)
  const [hasShield, setHasShield] = useState(false)
  const [shieldProgress, setShieldProgress] = useState(0)
  const [isBossWave, setIsBossWave] = useState(false)
  const [bossStagesLeft, setBossStagesLeft] = useState(0)
  const [activeLane, setActiveLane] = useState<number>(1)
  const [laneOptions, setLaneOptions] = useState<LaneOptionUI[]>([])
  const [targetWord, setTargetWord] = useState<WordItem | null>(null)
  const [missedWords, setMissedWords] = useState<WordItem[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(
    () => storageService.getHighScores()['sky-defender'] || 0
  )

  // Mutable 60fps engine state
  const engineRef = useRef({
    width: 380,
    height: 360,
    jetX: 190,
    targetX: 190,
    lockedLane: 1,
    keys: { left: false, right: false },
    enemies: [] as EnemyPlane[],
    lasers: [] as LaserBolt[],
    particles: [] as Particle[],
    shockwaves: [] as Shockwave[],
    floatingTexts: [] as FloatingText[],
    stars: [] as Star[],
    fireCooldown: 0,
    muzzleFlash: 0,
    waveTransitionDelay: 0,
    damageFlash: 0,
    shakeTime: 0,
    shakeMag: 0,
    score: 0,
    wave: 1,
    combo: 1,
    lives: 3,
    kills: 0,
    hasShield: false,
    shieldCharge: 0,
    bossStagesLeft: 0,
    bossMaxStages: 3,
    bossHitFlash: 0,
    running: true,
    paused: false,
    armedForWave: false,
    nextPlaneId: 1,
    currentTarget: null as WordItem | null,
    wordDeckQueue: [] as WordItem[],
  })

  const getPlayablePool = useCallback((): WordItem[] => {
    const ideal = words.filter((w) => w.term.length <= 22 && w.definition.length <= 115)
    if (ideal.length >= 8) return ideal
    const conciseTerm = words.filter((w) => w.term.length <= 22)
    if (conciseTerm.length >= 6) return conciseTerm
    if (words.length >= 4) return words

    const combined = [...words]
    const seen = new Set(words.map((w) => w.term.toLowerCase()))
    for (const iw of storageService.getWords()) {
      if (iw.term.length <= 22 && iw.definition.length <= 115 && !seen.has(iw.term.toLowerCase())) {
        seen.add(iw.term.toLowerCase())
        combined.push(iw)
      }
      if (combined.length >= 16) break
    }
    return combined
  }, [words])

  const spawnExplosion = (x: number, y: number, color: string, count = 24, ringRadius = 46) => {
    const st = engineRef.current
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45
      const spd = 55 + Math.random() * 170
      st.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3.8,
      })
    }
    if (ringRadius > 0) {
      st.shockwaves.push({
        x,
        y,
        radius: 8,
        maxRadius: ringRadius,
        life: 0.32,
        maxLife: 0.32,
        color,
      })
    }
  }

  const triggerShake = (mag = 5, duration = 0.14) => {
    const st = engineRef.current
    st.shakeMag = Math.max(st.shakeMag, mag)
    st.shakeTime = Math.max(st.shakeTime, duration)
  }

  const spawnWave = useCallback(
    (waveNum: number, continuingBoss = false) => {
      const st = engineRef.current
      const pool = getPlayablePool()
      if (pool.length === 0) return

      if (st.wordDeckQueue.length === 0) {
        st.wordDeckQueue = shuffle(pool)
      }

      const chosenTarget = st.wordDeckQueue.pop()!
      st.currentTarget = chosenTarget
      setTargetWord(chosenTarget)

      const bossMode = waveNum > 0 && waveNum % 5 === 0
      if (bossMode && !continuingBoss) {
        st.bossStagesLeft = 3
        st.bossMaxStages = 3
        setIsBossWave(true)
        setBossStagesLeft(3)
        audioService.playBossWarning()
        st.floatingTexts.push({
          x: st.width / 2,
          y: st.height * 0.64,
          text: `⚠️ ĐỢT ${waveNum}: TÀU MẸ BOSS!`,
          color: '#f59e0b',
          life: 1.35,
        })
      } else if (!bossMode) {
        st.bossStagesLeft = 0
        setIsBossWave(false)
        setBossStagesLeft(0)
      }

      const distractors = shuffle(
        pool.filter(
          (w) =>
            w.term.toLowerCase() !== chosenTarget.term.toLowerCase() &&
            w.definition.trim().toLowerCase() !== chosenTarget.definition.trim().toLowerCase()
        )
      ).slice(0, 2)

      const waveWords = shuffle([chosenTarget, ...distractors])

      // Speed proportional to arena height H so desktop & mobile feel equally brisk (~6.2s -> ~4.4s)
      const heightFactor = Math.max(300, st.height)
      const ratioSpeed = Math.min(0.185, 0.105 + (waveNum - 1) * 0.0065)
      const baseSpeed = heightFactor * (bossMode ? ratioSpeed * 0.92 : ratioSpeed)

      // Hold weapons until player selects a lane for this target
      st.armedForWave = false
      const startY = bossMode ? 76 : 22

      st.enemies = waveWords.map((w, idx) => ({
        id: st.nextPlaneId++,
        lane: idx,
        baseX: st.width * LANE_RATIOS[idx],
        x: st.width * LANE_RATIOS[idx],
        y: startY - (idx === 1 ? 0 : 12),
        speed: baseSpeed + (idx % 2) * 3,
        swayPhase: idx * 2.1 + Math.random(),
        word: w,
        isCorrect: w.term.toLowerCase() === chosenTarget.term.toLowerCase(),
        hp: 2,
        maxHp: 2,
        hitFlash: 0,
      }))

      setLaneOptions(
        waveWords.map((w, idx) => ({
          lane: idx,
          term: w.term,
        }))
      )
    },
    [getPlayablePool]
  )

  const triggerGameOver = useCallback((finalScore: number) => {
    const st = engineRef.current
    st.running = false
    st.paused = false
    setIsPaused(false)

    const isNew = storageService.saveHighScore('sky-defender', finalScore)
    setIsNewRecord(isNew)
    setBestScore(storageService.getHighScores()['sky-defender'] || finalScore)
    setIsGameOver(true)

    if (isNew && finalScore > 0) {
      audioService.playSuccessChime()
      try {
        confetti({
          particleCount: 65,
          spread: 70,
          origin: { y: 0.6 },
        })
      } catch {}
    }
  }, [])

  const lockAndFireLane = useCallback((laneIndex: number) => {
    const st = engineRef.current
    if (!st.running || st.paused) return
    const clampedLane = Math.max(0, Math.min(2, laneIndex))
    st.lockedLane = clampedLane
    st.targetX = st.width * LANE_RATIOS[clampedLane]
    st.armedForWave = true
    setActiveLane(clampedLane)
  }, [])

  const togglePause = useCallback(() => {
    const st = engineRef.current
    if (!st.running) return
    const nextPaused = !st.paused
    st.paused = nextPaused
    st.keys.left = false
    st.keys.right = false
    setIsPaused(nextPaused)
    audioService.playClick()
  }, [])

  const startNewGame = useCallback(() => {
    const st = engineRef.current
    st.score = 0
    st.wave = 1
    st.combo = 1
    st.lives = 3
    st.kills = 0
    st.hasShield = false
    st.shieldCharge = 0
    st.bossStagesLeft = 0
    st.bossHitFlash = 0
    st.lasers = []
    st.particles = []
    st.shockwaves = []
    st.floatingTexts = []
    st.enemies = []
    st.fireCooldown = 0.1
    st.muzzleFlash = 0
    st.waveTransitionDelay = 0
    st.damageFlash = 0
    st.shakeTime = 0
    st.shakeMag = 0
    st.running = true
    st.paused = false
    st.wordDeckQueue = []
    st.lockedLane = 1
    st.jetX = st.width * LANE_RATIOS[1]
    st.targetX = st.width * LANE_RATIOS[1]

    setScore(0)
    setWave(1)
    setCombo(1)
    setLives(3)
    setKills(0)
    setHasShield(false)
    setShieldProgress(0)
    setIsBossWave(false)
    setBossStagesLeft(0)
    setActiveLane(1)
    setMissedWords([])
    setIsPaused(false)
    setIsNewRecord(false)
    setIsGameOver(false)

    spawnWave(1)
  }, [spawnWave])

  // Main 60fps Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      const w = Math.max(280, rect.width)
      const h = Math.max(270, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)

      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      const st = engineRef.current
      const prevW = st.width
      st.width = w
      st.height = h
      if (prevW !== w) {
        st.enemies.forEach((e) => {
          e.baseX = w * LANE_RATIOS[e.lane]
          e.x = e.baseX
        })
        st.targetX = w * LANE_RATIOS[st.lockedLane]
        st.jetX = st.targetX
      }
    }

    updateSize()

    const st = engineRef.current
    st.stars = Array.from({ length: 48 }, (_, i) => ({
      x: Math.random() * st.width,
      y: Math.random() * st.height,
      size: i % 3 === 0 ? 1.9 : 1.0,
      speed: i % 3 === 0 ? 52 : 24,
      alpha: 0.25 + Math.random() * 0.65,
    }))

    startNewGame()

    window.addEventListener('resize', updateSize)

    const handleVisibilityChange = () => {
      if (document.hidden && st.running && !st.paused) {
        st.paused = true
        st.keys.left = false
        st.keys.right = false
        setIsPaused(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (st.running) {
          e.preventDefault()
          st.paused = !st.paused
          st.keys.left = false
          st.keys.right = false
          setIsPaused(st.paused)
        }
        return
      }
      if (!st.running || st.paused) return

      if (e.key === '1') {
        lockAndFireLane(0)
      } else if (e.key === '2') {
        lockAndFireLane(1)
      } else if (e.key === '3') {
        lockAndFireLane(2)
      } else if (e.key === ' ') {
        e.preventDefault()
        st.targetX = st.width * LANE_RATIOS[st.lockedLane]
        st.armedForWave = true
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const nextLane = Math.max(0, st.lockedLane - 1)
        st.lockedLane = nextLane
        st.targetX = st.width * LANE_RATIOS[nextLane]
        setActiveLane(nextLane)
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const nextLane = Math.min(2, st.lockedLane + 1)
        st.lockedLane = nextLane
        st.targetX = st.width * LANE_RATIOS[nextLane]
        setActiveLane(nextLane)
      } else if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault()
        st.targetX = st.width * LANE_RATIOS[st.lockedLane]
        st.armedForWave = true
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    let animId = 0
    let lastTime = performance.now()

    const applyDamageOrShield = (reasonText: string, textX: number, textY: number): boolean => {
      if (st.hasShield) {
        st.hasShield = false
        st.shieldCharge = 0
        setHasShield(false)
        setShieldProgress(0)
        audioService.playShieldBlock()
        spawnExplosion(st.jetX, st.height - 44, '#38bdf8', 20, 56)
        st.floatingTexts.push({
          x: st.width / 2,
          y: Math.max(60, textY),
          text: '🛡️ KHIÊN CHẮN SÁT THƯƠNG!',
          color: '#38bdf8',
          life: 1.05,
        })
        return false
      }

      st.damageFlash = 1
      st.combo = 1
      st.shieldCharge = 0
      st.lives -= 1
      triggerShake(7, 0.2)

      const missed = st.currentTarget
      if (missed) {
        setMissedWords((prev) =>
          prev.some((w) => w.id === missed.id) ? prev : [...prev.slice(-2), missed]
        )
      }

      st.floatingTexts.push({
        x: Math.min(st.width - 75, Math.max(75, textX)),
        y: Math.max(55, textY),
        text: reasonText,
        color: '#fb7185',
        life: 1.05,
      })

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([80, 40, 80])
        } catch {}
      }
      audioService.playErrorBuzz()
      setCombo(1)
      setShieldProgress(0)
      setLives(st.lives)

      if (st.lives <= 0) {
        triggerGameOver(st.score)
        return true
      }
      return false
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const W = st.width
      const H = st.height
      const jetY = H - 38
      const isOverdrive = st.combo >= 4

      // 1. Update Game Physics
      if (st.running && !st.paused) {
        // Snappy jet dash interpolation
        const prevJetX = st.jetX
        st.jetX += (st.targetX - st.jetX) * Math.min(1, dt * 20)
        const alignedWithTarget = Math.abs(st.targetX - st.jetX) < 15

        // Fire plasma salvo ONLY when aligned on target lane (zero friendly-fire while crossing lanes!)
        st.fireCooldown = Math.max(0, st.fireCooldown - dt)
        st.muzzleFlash = Math.max(0, st.muzzleFlash - dt * 8)
        if (
          st.armedForWave &&
          alignedWithTarget &&
          st.enemies.some((e) => e.y >= 16) &&
          st.fireCooldown <= 0
        ) {
          st.fireCooldown = 0.13
          st.muzzleFlash = 1
          audioService.playLaser(isOverdrive)
          st.lasers.push(
            { x: st.jetX - 10, y: jetY - 18, vy: -820, overdrive: isOverdrive },
            { x: st.jetX + 10, y: jetY - 18, vy: -820, overdrive: isOverdrive }
          )
        }
        void prevJetX

        if (st.waveTransitionDelay > 0) {
          st.waveTransitionDelay -= dt
          if (st.waveTransitionDelay <= 0) {
            st.waveTransitionDelay = 0
            spawnWave(st.wave, st.bossStagesLeft > 0)
          }
        }

        // Move lasers
        for (let i = st.lasers.length - 1; i >= 0; i--) {
          st.lasers[i].y += st.lasers[i].vy * dt
          if (st.lasers[i].y < -24) {
            st.lasers.splice(i, 1)
          }
        }

        if (st.bossHitFlash > 0) {
          st.bossHitFlash = Math.max(0, st.bossHitFlash - dt * 4)
        }

        // Move enemies & check collisions
        let correctPlaneEscaped = false

        for (let i = st.enemies.length - 1; i >= 0; i--) {
          const enemy = st.enemies[i]
          enemy.y += enemy.speed * dt
          // Gentle alive flight sway within lane bounds
          enemy.x = enemy.baseX + Math.sin(now * 0.0032 + enemy.swayPhase) * 4.5
          if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 6)

          let destroyed = false
          if (enemy.y >= 16) {
            for (let j = st.lasers.length - 1; j >= 0; j--) {
              const b = st.lasers[j]
              if (Math.abs(b.x - enemy.x) < 34 && Math.abs(b.y - enemy.y) < 26) {
                st.lasers.splice(j, 1)
                enemy.hp -= 1
                enemy.hitFlash = 1
                spawnExplosion(b.x, b.y, b.overdrive ? '#fbbf24' : '#38bdf8', 6, 0)

                if (enemy.hp <= 0) {
                  destroyed = true
                  break
                } else {
                  audioService.playHitTick()
                }
              }
            }
          }

          if (destroyed) {
            if (enemy.isCorrect) {
              // TARGET INTERCEPTED!
              const isBossStage = st.bossStagesLeft > 0
              spawnExplosion(enemy.x, enemy.y, '#34d399', 28, 52)
              triggerShake(isBossStage ? 7 : 4.5, 0.14)
              st.enemies.forEach((other) => {
                if (other.id !== enemy.id) {
                  spawnExplosion(other.x, other.y, '#6366f1', 10, 26)
                }
              })
              st.enemies = []
              st.lasers = []
              st.armedForWave = false
              setLaneOptions([])

              const mult = isOverdrive ? st.combo * 2 : st.combo
              let points = 100 * mult
              st.kills += 1
              const nextCombo = Math.min(8, st.combo + 1)
              st.combo = nextCombo

              // Charge Aegis Shield every 4 consecutive hits
              if (!st.hasShield) {
                st.shieldCharge += 1
                if (st.shieldCharge >= SHIELD_CHARGE_NEEDED) {
                  st.hasShield = true
                  st.shieldCharge = SHIELD_CHARGE_NEEDED
                  setHasShield(true)
                  audioService.playPowerup()
                  st.floatingTexts.push({
                    x: st.jetX,
                    y: jetY - 36,
                    text: '🛡️ KÍCH HOẠT KHIÊN NĂNG LƯỢNG!',
                    color: '#38bdf8',
                    life: 1.1,
                  })
                }
                setShieldProgress(st.shieldCharge)
              }

              if (isBossStage) {
                st.bossStagesLeft -= 1
                st.bossHitFlash = 1
                setBossStagesLeft(st.bossStagesLeft)

                if (st.bossStagesLeft <= 0) {
                  // BOSS DEFEATED!
                  points += 400
                  spawnExplosion(W / 2, 42, '#f59e0b', 45, 95)
                  audioService.playExplosion(true)
                  triggerShake(10, 0.28)

                  let bossBanner = `💥 HẠ TÀU MẸ! +${points}`
                  if (st.lives < 3) {
                    st.lives += 1
                    setLives(st.lives)
                    bossBanner = `💥 HẠ BOSS! +${points} & +1 ❤️`
                  }
                  st.floatingTexts.push({
                    x: W / 2,
                    y: 72,
                    text: bossBanner,
                    color: '#fbbf24',
                    life: 1.35,
                  })
                  setIsBossWave(false)
                  st.wave += 1
                  setWave(st.wave)
                  st.waveTransitionDelay = 0.65
                } else {
                  audioService.playExplosion(false)
                  st.floatingTexts.push({
                    x: enemy.x,
                    y: enemy.y,
                    text: `⚡ PHÁ GIÁP BOSS (${3 - st.bossStagesLeft}/3) +${points}`,
                    color: '#34d399',
                    life: 0.95,
                  })
                  st.waveTransitionDelay = 0.35
                }
              } else {
                audioService.playExplosion(false)
                audioService.playCombo(nextCombo)
                st.floatingTexts.push({
                  x: enemy.x,
                  y: enemy.y,
                  text: isOverdrive ? `🔥 +${points} (OVERDRIVE)` : `+${points}`,
                  color: isOverdrive ? '#fbbf24' : '#34d399',
                  life: 0.85,
                })
                st.wave += 1
                setWave(st.wave)
                st.waveTransitionDelay = 0.38
              }

              st.score += points
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(25)
                } catch {}
              }
              storageService.recordDailyActivity(true)

              setScore(st.score)
              setKills(st.kills)
              setCombo(st.combo)
              break
            } else {
              // WRONG PLANE HIT
              spawnExplosion(enemy.x, enemy.y, '#f43f5e', 24, 42)
              st.enemies.splice(i, 1)
              st.lasers = []
              st.armedForWave = false
              setLaneOptions((prev) => prev.filter((o) => o.lane !== enemy.lane))

              const ended = applyDamageOrShield('BẮN NHẦM! -1 TIM', enemy.x, enemy.y)
              if (ended) break
            }
            continue
          }

          if (enemy.y > H - 24) {
            if (enemy.isCorrect) {
              correctPlaneEscaped = true
            }
            st.enemies.splice(i, 1)
          }
        }

        if (correctPlaneEscaped && st.running) {
          st.enemies = []
          st.lasers = []
          st.armedForWave = false
          setLaneOptions([])

          const ended = applyDamageOrShield('LỌT MỤC TIÊU! -1 TIM', W / 2, H - 70)
          if (!ended) {
            if (st.bossStagesLeft <= 0) {
              st.wave += 1
              setWave(st.wave)
            }
            st.waveTransitionDelay = 0.45
          }
        }

        // Starfield speed boost in Overdrive
        const starMult = isOverdrive ? 2.1 : 1
        for (const s of st.stars) {
          s.y += s.speed * starMult * dt
          if (s.y > H) {
            s.y = 0
            s.x = Math.random() * W
          }
        }

        for (let i = st.particles.length - 1; i >= 0; i--) {
          const p = st.particles[i]
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vx *= 0.96
          p.vy *= 0.96
          p.life -= dt
          if (p.life <= 0) st.particles.splice(i, 1)
        }

        for (let i = st.shockwaves.length - 1; i >= 0; i--) {
          const sw = st.shockwaves[i]
          sw.life -= dt
          const progress = 1 - Math.max(0, sw.life / sw.maxLife)
          sw.radius = 8 + (sw.maxRadius - 8) * progress
          if (sw.life <= 0) st.shockwaves.splice(i, 1)
        }

        for (let i = st.floatingTexts.length - 1; i >= 0; i--) {
          const ft = st.floatingTexts[i]
          ft.y -= 38 * dt
          ft.life -= dt
          if (ft.life <= 0) st.floatingTexts.splice(i, 1)
        }

        if (st.damageFlash > 0) st.damageFlash = Math.max(0, st.damageFlash - dt * 3)
        if (st.shakeTime > 0) {
          st.shakeTime = Math.max(0, st.shakeTime - dt)
          if (st.shakeTime === 0) st.shakeMag = 0
        }
      }

      // 2. Render Cyber Space Arena
      ctx.save()
      if (st.shakeTime > 0 && !st.paused) {
        const sx = (Math.random() - 0.5) * st.shakeMag * 2
        const sy = (Math.random() - 0.5) * st.shakeMag * 2
        ctx.translate(sx, sy)
      }

      const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
      bgGrad.addColorStop(0, '#050816')
      bgGrad.addColorStop(0.55, '#0b132b')
      bgGrad.addColorStop(1, '#111827')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Cosmic Nebula Glow
      const nebGrad = ctx.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.35, W * 0.65)
      nebGrad.addColorStop(
        0,
        isOverdrive ? 'rgba(245, 158, 11, 0.13)' : 'rgba(79, 70, 229, 0.16)'
      )
      nebGrad.addColorStop(1, 'rgba(5, 8, 22, 0)')
      ctx.fillStyle = nebGrad
      ctx.fillRect(0, 0, W, H)

      // 3-Lane Cyber Dividers + Active Lane Highlight Column
      const activeLaneCenter = W * LANE_RATIOS[st.lockedLane]
      const laneGlow = ctx.createLinearGradient(0, 0, 0, H)
      laneGlow.addColorStop(0, 'rgba(56, 189, 248, 0.01)')
      laneGlow.addColorStop(1, 'rgba(56, 189, 248, 0.08)')
      ctx.fillStyle = laneGlow
      ctx.fillRect(activeLaneCenter - W * 0.15, 0, W * 0.3, H)

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.14)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 8])
      ;[0.34, 0.66].forEach((ratio) => {
        ctx.beginPath()
        ctx.moveTo(W * ratio, 0)
        ctx.lineTo(W * ratio, H)
        ctx.stroke()
      })
      ctx.setLineDash([])

      // Parallax Stars & Overdrive Warp Lines
      for (const s of st.stars) {
        ctx.fillStyle = isOverdrive
          ? `rgba(253, 224, 71, ${s.alpha})`
          : `rgba(226, 232, 240, ${s.alpha})`
        if (isOverdrive && s.speed > 40) {
          ctx.fillRect(s.x - 0.7, s.y - 8, 1.4, 14)
        } else {
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Boss Dreadnought Mothership at Top Airspace
      if (st.bossStagesLeft > 0) {
        const bx = W / 2 + Math.sin(now * 0.002) * 14
        const by = 34
        ctx.save()
        ctx.translate(bx, by)

        // Boss hull
        const bossW = Math.min(220, W * 0.62)
        ctx.fillStyle = st.bossHitFlash > 0.1 ? '#ffffff' : '#3f1d38'
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-bossW / 2, -8)
        ctx.lineTo(-bossW * 0.32, 16)
        ctx.lineTo(0, 24)
        ctx.lineTo(bossW * 0.32, 16)
        ctx.lineTo(bossW / 2, -8)
        ctx.lineTo(bossW * 0.28, -18)
        ctx.lineTo(-bossW * 0.28, -18)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Boss glowing reactor core
        ctx.fillStyle = '#f43f5e'
        ctx.beginPath()
        ctx.arc(0, 2, 8 + Math.sin(now * 0.015) * 2, 0, Math.PI * 2)
        ctx.fill()

        // Boss 3-stage armor bar
        const barW = 96
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
        drawRoundedRect(ctx, -barW / 2, -24, barW, 6, 3)
        ctx.fill()
        ctx.fillStyle = '#f59e0b'
        drawRoundedRect(ctx, -barW / 2, -24, (barW * st.bossStagesLeft) / st.bossMaxStages, 6, 3)
        ctx.fill()

        ctx.restore()
      }

      // Defense Perimeter Line
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(12, H - 16)
      ctx.lineTo(W - 12, H - 16)
      ctx.stroke()

      // Plasma Laser Bolts
      for (const b of st.lasers) {
        const mainColor = b.overdrive ? '#fbbf24' : '#38bdf8'
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = mainColor
        ctx.shadowBlur = 10
        drawRoundedRect(ctx, b.x - 2.2, b.y - 11, 4.4, 20, 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // Enemy Interceptors & Crisp Word Shields
      for (const enemy of st.enemies) {
        ctx.save()
        ctx.translate(enemy.x, enemy.y)

        // Twin thruster glow
        const pulse = 4 + Math.sin(now * 0.025 + enemy.id) * 1.5
        ctx.fillStyle = 'rgba(251, 113, 133, 0.75)'
        ctx.beginPath()
        ctx.arc(-8, -16, pulse, 0, Math.PI * 2)
        ctx.arc(8, -16, pulse, 0, Math.PI * 2)
        ctx.fill()

        // Outer Swept Armored Wings
        ctx.fillStyle = enemy.hitFlash > 0.1 ? '#ffffff' : '#1e293b'
        ctx.strokeStyle = enemy.hitFlash > 0.1 ? '#38bdf8' : '#f43f5e'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(0, 18)
        ctx.lineTo(13, 4)
        ctx.lineTo(27, -4)
        ctx.lineTo(22, -14)
        ctx.lineTo(10, -10)
        ctx.lineTo(6, -18)
        ctx.lineTo(-6, -18)
        ctx.lineTo(-10, -10)
        ctx.lineTo(-22, -14)
        ctx.lineTo(-27, -4)
        ctx.lineTo(-13, 4)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Inner fuselage trim & glowing crimson cockpit
        ctx.fillStyle = '#fb7185'
        ctx.beginPath()
        ctx.moveTo(0, 11)
        ctx.lineTo(4.5, -2)
        ctx.lineTo(0, -8)
        ctx.lineTo(-4.5, -2)
        ctx.closePath()
        ctx.fill()

        // Tactical Word Pill with Lane Number Badge
        const label = enemy.word.term
        const maxPillW = Math.floor(W * 0.315)
        ctx.font = '700 12px system-ui, -apple-system, sans-serif'

        let lines = [label]
        if (ctx.measureText(label).width > maxPillW - 14 && label.includes(' ')) {
          const parts = label.split(' ')
          const mid = Math.ceil(parts.length / 2)
          lines = [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')]
        } else if (ctx.measureText(label).width > maxPillW - 10) {
          ctx.font = '700 10.5px system-ui, -apple-system, sans-serif'
        }

        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
        const pillW = Math.min(maxPillW, Math.max(64, textW + 16))
        const pillH = lines.length > 1 ? 33 : 23
        const pillY = 21

        const isTargetedLane = st.lockedLane === enemy.lane
        ctx.fillStyle = isTargetedLane ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.9)'
        ctx.strokeStyle = isTargetedLane ? '#38bdf8' : 'rgba(129, 140, 248, 0.65)'
        ctx.lineWidth = isTargetedLane ? 1.8 : 1.2
        drawRoundedRect(ctx, -pillW / 2, pillY, pillW, pillH, 8)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (lines.length === 1) {
          ctx.fillText(lines[0], 0, pillY + pillH / 2 + 0.5, pillW - 10)
        } else {
          ctx.fillText(lines[0], 0, pillY + 10, pillW - 10)
          ctx.fillText(lines[1], 0, pillY + 23, pillW - 10)
        }

        ctx.restore()
      }

      // Target Sightline
      if (st.enemies.length > 0 && !st.paused) {
        ctx.strokeStyle = st.armedForWave
          ? 'rgba(56, 189, 248, 0.35)'
          : 'rgba(148, 163, 184, 0.16)'
        ctx.lineWidth = 1.4
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(st.jetX, jetY - 24)
        ctx.lineTo(st.jetX, 34)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Player Valkyrie Starfighter (with dynamic banking roll!)
      ctx.save()
      ctx.translate(st.jetX, jetY)
      const bankAngle = Math.max(-0.28, Math.min(0.28, (st.targetX - st.jetX) * 0.012))
      ctx.rotate(bankAngle)

      // Aegis Forcefield Ring
      if (st.hasShield) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.55 + Math.sin(now * 0.008) * 0.2})`
        ctx.fillStyle = 'rgba(56, 189, 248, 0.09)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, -1, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      // Twin Afterburner Plumes
      const flameLen = st.paused ? 10 : 12 + Math.sin(now * 0.045) * 4.5
      ;[-7, 7].forEach((ox) => {
        const fg = ctx.createLinearGradient(ox, 12, ox, 12 + flameLen)
        fg.addColorStop(0, isOverdrive ? '#fde047' : '#38bdf8')
        fg.addColorStop(1, 'rgba(99, 102, 241, 0)')
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.moveTo(ox - 3.5, 12)
        ctx.lineTo(ox, 12 + flameLen)
        ctx.lineTo(ox + 3.5, 12)
        ctx.closePath()
        ctx.fill()
      })

      // Wingtip Laser Pods & Muzzle Flashes
      ctx.fillStyle = isOverdrive ? '#fbbf24' : '#38bdf8'
      ctx.fillRect(-12, -15, 3, 12)
      ctx.fillRect(9, -15, 3, 12)
      if (st.muzzleFlash > 0.05) {
        ctx.fillStyle = `rgba(255, 255, 255, ${st.muzzleFlash})`
        ctx.beginPath()
        ctx.arc(-10.5, -18, 5, 0, Math.PI * 2)
        ctx.arc(10.5, -18, 5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Starfighter Swept Delta Wings
      const hullGrad = ctx.createLinearGradient(0, -24, 0, 16)
      hullGrad.addColorStop(0, '#f8fafc')
      hullGrad.addColorStop(0.6, '#c7d2fe')
      hullGrad.addColorStop(1, '#6366f1')
      ctx.fillStyle = hullGrad
      ctx.strokeStyle = isOverdrive ? '#fbbf24' : '#38bdf8'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(0, -24)
      ctx.lineTo(9, -6)
      ctx.lineTo(26, 10)
      ctx.lineTo(22, 15)
      ctx.lineTo(10, 10)
      ctx.lineTo(6, 16)
      ctx.lineTo(-6, 16)
      ctx.lineTo(-10, 10)
      ctx.lineTo(-22, 15)
      ctx.lineTo(-26, 10)
      ctx.lineTo(-9, -6)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Sapphire Canopy Glass
      ctx.fillStyle = '#0284c7'
      ctx.beginPath()
      ctx.ellipse(0, -4, 4, 8.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.beginPath()
      ctx.ellipse(-1.2, -6.5, 1.3, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      // Shockwave Rings
      for (const sw of st.shockwaves) {
        ctx.strokeStyle = sw.color
        ctx.globalAlpha = Math.max(0, sw.life / sw.maxLife)
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Sparks / Particles
      for (const p of st.particles) {
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Floating Combat Popups
      for (const ft of st.floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life * 1.5)
        ctx.font = '800 13px system-ui, -apple-system, sans-serif'
        ctx.fillStyle = ft.color
        ctx.textAlign = 'center'
        ctx.fillText(ft.text, ft.x, ft.y)
      }
      ctx.globalAlpha = 1

      if (st.damageFlash > 0) {
        ctx.fillStyle = `rgba(244, 63, 94, ${st.damageFlash * 0.28})`
        ctx.fillRect(0, 0, W, H)
      }

      ctx.restore()
      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', updateSize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [spawnWave, startNewGame, triggerGameOver, lockAndFireLane])

  const handleCanvasTapOrDrag = (clientX: number, fireImmediately: boolean) => {
    const st = engineRef.current
    if (!st.running || st.paused) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relX = clientX - rect.left

    let nearestLane = 1
    let minDist = Infinity
    LANE_RATIOS.forEach((ratio, idx) => {
      const d = Math.abs(relX - rect.width * ratio)
      if (d < minDist) {
        minDist = d
        nearestLane = idx
      }
    })

    st.lockedLane = nearestLane
    st.targetX = st.width * LANE_RATIOS[nearestLane]
    setActiveLane(nearestLane)
    if (fireImmediately) {
      st.armedForWave = true
    }
  }

  return (
    <div
      className="w-full max-w-lg mx-auto my-auto px-3 py-1.5 flex flex-col select-none"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              audioService.stopSpeech()
              onBack()
            }}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            title="Thoát trò chơi"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {!isGameOver && (
            <button
              type="button"
              onClick={togglePause}
              className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title={isPaused ? 'Tiếp tục (P)' : 'Tạm dừng (P)'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span
            className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
              isBossWave
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 animate-pulse'
                : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {isBossWave && <Skull className="w-3.5 h-3.5" />}
            <span>{isBossWave ? `BOSS (${3 - bossStagesLeft}/3)` : `Đợt ${wave}`}</span>
          </span>

          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
            {score.toLocaleString()} đ
          </span>

          {combo > 1 && (
            <span
              className={`text-xs font-extrabold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                combo >= 4
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xs'
                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              }`}
            >
              {combo >= 4 && <Flame className="w-3 h-3" />}
              <span>x{combo}</span>
            </span>
          )}
        </div>

        {/* Shield + 3 Hearts */}
        <div className="flex items-center gap-1.5">
          <div
            title={
              hasShield
                ? 'Khiên Aegis đã bật: Chặn 1 lần mất máu!'
                : `Bắn trúng liên tiếp ${SHIELD_CHARGE_NEEDED - shieldProgress} mục tiêu nữa để nạp Khiên`
            }
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-0.5 border transition-all ${
              hasShield
                ? 'bg-sky-500/20 border-sky-400 text-sky-500 dark:text-sky-300 shadow-xs'
                : 'bg-slate-200/60 dark:bg-slate-800 border-transparent text-slate-400'
            }`}
          >
            <Shield className={`w-3 h-3 ${hasShield ? 'fill-sky-400' : ''}`} />
            <span>{hasShield ? 'ON' : `${shieldProgress}/${SHIELD_CHARGE_NEEDED}`}</span>
          </div>

          <div className="flex items-center gap-0.5">
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
      </div>

      {/* Target Meaning Radar Bar */}
      <div
        className={`rounded-2xl px-3.5 py-2.5 mb-2 border shadow-md flex items-center justify-between gap-2 transition-colors ${
          isBossWave
            ? 'bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 border-amber-500/50 text-white'
            : 'bg-slate-900 border-indigo-500/40 text-white'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {isBossWave ? 'Mục tiêu phá giáp Tàu Mẹ' : `Mục tiêu cần bắn hạ (${deckName})`}
            </span>
          </div>
          <div className="text-sm font-bold text-white leading-snug line-clamp-2 mt-0.5">
            {targetWord ? formatArcadeMeaning(targetWord.definition, 96) : 'Đang dò mục tiêu...'}
          </div>
        </div>
        {targetWord && (
          <button
            type="button"
            onClick={() => audioService.speak(targetWord.term, 0.9)}
            title="Nghe gợi ý phát âm"
            className="w-9 h-9 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/40 text-cyan-300 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Balanced 60fps Space Combat Arena (No 800px stretched chimney!) */}
      <div
        ref={containerRef}
        data-no-pull="true"
        className={`w-full ${
          isGameOver ? 'min-h-[380px] sm:min-h-[420px]' : 'h-[310px] sm:h-[380px]'
        } rounded-3xl overflow-hidden relative border-2 border-slate-800 shadow-xl touch-none`}
        onTouchStart={(e) => handleCanvasTapOrDrag(e.touches[0].clientX, true)}
        onTouchMove={(e) => handleCanvasTapOrDrag(e.touches[0].clientX, false)}
        onMouseDown={(e) => handleCanvasTapOrDrag(e.clientX, true)}
      >
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

        {/* Pause Overlay */}
        {isPaused && !isGameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mb-3">
              <Pause className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-extrabold text-white mb-1">Tạm dừng Không Chiến</h3>
            <p className="text-xs text-slate-400 mb-5">
              Đợt {wave} • Điểm hiện tại: <strong>{score.toLocaleString()}</strong>
            </p>
            <div className="w-full max-w-xs space-y-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Tiếp tục chiến đấu</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  audioService.stopSpeech()
                  onBack()
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
              >
                Về Đấu Trường chọn trò khác
              </button>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-5 text-center animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-amber-400 flex items-center justify-center mb-2">
              <Trophy className="w-7 h-7" />
            </div>

            {isNewRecord && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                Kỷ lục mới!
              </span>
            )}

            <h3 className="text-xl font-extrabold text-white">Kết thúc Không Chiến</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-3.5">
              Đã bắn hạ chuẩn <strong>{kills}</strong> mục tiêu • Đạt tới Đợt <strong>{wave}</strong>
            </p>

            <div className="w-full max-w-xs grid grid-cols-2 gap-2.5 mb-3">
              <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-lg font-extrabold text-cyan-400">
                  {score.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">Điểm đạt được</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-lg font-extrabold text-amber-400">
                  {bestScore.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">Kỷ lục cao nhất</div>
              </div>
            </div>

            {missedWords.length > 0 && (
              <div className="w-full max-w-xs mb-3 text-left bg-slate-900/95 rounded-2xl p-2.5 border border-slate-800 space-y-1">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                  Mục tiêu vừa sẩy chân (Chạm 🔊 để nhớ)
                </div>
                {missedWords.map((mw) => (
                  <div key={mw.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                    <div className="min-w-0">
                      <span className="font-extrabold text-white">{mw.term}</span>
                      <span className="text-slate-400 block truncate text-[11px]">
                        {formatArcadeMeaning(mw.definition, 54)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void audioService.speak(mw.term, 0.9)
                      }}
                      className="p-1.5 rounded-lg bg-indigo-500/20 text-cyan-300 shrink-0"
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
                onClick={() => {
                  audioService.playClick()
                  startNewGame()
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Xuất kích chơi lại</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  audioService.stopSpeech()
                  onBack()
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
              >
                Về Đấu Trường chọn trò khác
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tactile 3-Lane Arcade Fire Deck (Thumbs never cover canvas; 1-tap locks & fires!) */}
      {!isGameOver && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[0, 1, 2].map((laneIdx) => {
            const opt = laneOptions.find((o) => o.lane === laneIdx)
            const isSelected = activeLane === laneIdx
            return (
              <button
                key={laneIdx}
                type="button"
                disabled={isPaused || !opt}
                onClick={() => lockAndFireLane(laneIdx)}
                className={`py-2 px-2 rounded-2xl border-b-4 font-bold transition-all active:border-b-0 active:translate-y-0.5 flex flex-col items-center justify-center min-h-[50px] ${
                  !opt
                    ? 'bg-slate-200/50 dark:bg-slate-800/40 border-slate-300 dark:border-slate-800 text-slate-400 opacity-50'
                    : isSelected
                    ? 'bg-slate-900 dark:bg-indigo-950 border-cyan-500 ring-1 ring-cyan-400/60 text-cyan-300 shadow-md'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-950 text-slate-800 dark:text-slate-100 hover:border-indigo-400'
                }`}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 dark:text-cyan-400 whitespace-nowrap">
                  Làn {laneIdx + 1} <span className="hidden sm:inline">• Khai hỏa</span>
                </span>
                <span className="text-xs font-extrabold truncate max-w-full mt-0.5">
                  {opt ? opt.term : '—'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
