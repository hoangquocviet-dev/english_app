import confetti from 'canvas-confetti'
import { ArrowLeft, Crosshair, Heart, RotateCcw, Trophy, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_WORDS } from '../../data/initialDecks'
import type { WordItem } from '../../types'
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
  x: number
  y: number
  speed: number
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

export function SkyDefenderGame({ words, deckName, onBack }: SkyDefenderGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [combo, setCombo] = useState(1)
  const [lives, setLives] = useState(3)
  const [kills, setKills] = useState(0)
  const [targetWord, setTargetWord] = useState<WordItem | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [bestScore, setBestScore] = useState(() => storageService.getHighScores()['sky-defender'] || 0)

  // Mutable 60fps engine state
  const engineRef = useRef({
    width: 360,
    height: 480,
    jetX: 180,
    targetX: 180,
    keys: { left: false, right: false },
    enemies: [] as EnemyPlane[],
    lasers: [] as LaserBolt[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    stars: [] as Star[],
    lastFireTime: 0,
    waveTransitionUntil: 0,
    damageFlash: 0,
    score: 0,
    wave: 1,
    combo: 1,
    lives: 3,
    kills: 0,
    running: true,
    nextPlaneId: 1,
    wordDeckQueue: [] as WordItem[],
  })

  // Build full playable word pool (prefer concise terms <= 22 chars for crisp fighter labels)
  const getPlayablePool = useCallback((): WordItem[] => {
    const concise = words.filter((w) => w.term.length <= 22)
    if (concise.length >= 6) return concise
    if (words.length >= 4) return words
    const combined = [...words]
    const seen = new Set(words.map((w) => w.term.toLowerCase()))
    for (const iw of INITIAL_WORDS) {
      if (iw.term.length <= 22 && !seen.has(iw.term.toLowerCase())) {
        seen.add(iw.term.toLowerCase())
        combined.push(iw)
      }
      if (combined.length >= 15) break
    }
    return combined
  }, [words])

  const spawnExplosion = (x: number, y: number, color: string, count = 22) => {
    const st = engineRef.current
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const spd = 45 + Math.random() * 145
      st.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3.5,
      })
    }
  }

  const spawnWave = useCallback(
    (waveNum: number) => {
      const st = engineRef.current
      const pool = getPlayablePool()
      if (pool.length === 0) return

      if (st.wordDeckQueue.length === 0) {
        st.wordDeckQueue = shuffle(pool)
      }

      const chosenTarget = st.wordDeckQueue.pop()!
      setTargetWord(chosenTarget)

      const distractors = shuffle(
        pool.filter((w) => w.term.toLowerCase() !== chosenTarget.term.toLowerCase())
      ).slice(0, 2)

      const waveWords = shuffle([chosenTarget, ...distractors])
      const laneRatios = [0.18, 0.5, 0.82]
      // Gentle speed scaling so players have comfortable time to read & steer
      const baseSpeed = Math.min(78, 36 + (waveNum - 1) * 3.2)

      st.enemies = waveWords.map((w, idx) => ({
        id: st.nextPlaneId++,
        lane: idx,
        x: st.width * laneRatios[idx],
        y: 10 - (idx === 1 ? 0 : 14),
        speed: baseSpeed + (idx % 2) * 3,
        word: w,
        isCorrect: w.term.toLowerCase() === chosenTarget.term.toLowerCase(),
        hp: 3,
        maxHp: 3,
        hitFlash: 0,
      }))
    },
    [getPlayablePool]
  )

  const triggerGameOver = useCallback((finalScore: number) => {
    const st = engineRef.current
    st.running = false
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

  const startNewGame = useCallback(() => {
    const st = engineRef.current
    st.score = 0
    st.wave = 1
    st.combo = 1
    st.lives = 3
    st.kills = 0
    st.lasers = []
    st.particles = []
    st.floatingTexts = []
    st.enemies = []
    st.waveTransitionUntil = 0
    st.damageFlash = 0
    st.running = true
    st.wordDeckQueue = []
    st.jetX = st.width / 2
    st.targetX = st.width / 2

    setScore(0)
    setWave(1)
    setCombo(1)
    setLives(3)
    setKills(0)
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
      const w = Math.max(300, rect.width)
      const h = Math.max(340, rect.height)
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
        const laneRatios = [0.18, 0.5, 0.82]
        st.enemies.forEach((e) => {
          e.x = w * laneRatios[e.lane]
        })
        st.jetX = Math.min(w - 30, Math.max(30, st.jetX))
        st.targetX = Math.min(w - 30, Math.max(30, st.targetX))
      }
    }

    updateSize()

    // Initialize starfield
    const st = engineRef.current
    st.stars = Array.from({ length: 42 }, () => ({
      x: Math.random() * st.width,
      y: Math.random() * st.height,
      size: 0.8 + Math.random() * 1.8,
      speed: 18 + Math.random() * 42,
      alpha: 0.25 + Math.random() * 0.65,
    }))

    startNewGame()

    window.addEventListener('resize', updateSize)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        st.keys.left = true
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        st.keys.right = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        st.keys.left = false
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        st.keys.right = false
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    let animId = 0
    let lastTime = performance.now()

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const W = st.width
      const H = st.height
      const jetY = H - 50

      // 1. Update Game Logic if running
      if (st.running) {
        // Keyboard steering
        const keySpeed = 300
        if (st.keys.left) st.targetX -= keySpeed * dt
        if (st.keys.right) st.targetX += keySpeed * dt
        st.targetX = Math.max(34, Math.min(W - 34, st.targetX))

        // Smooth jet interpolation
        st.jetX += (st.targetX - st.jetX) * Math.min(1, dt * 16)

        // Auto-fire twin laser bolts once enemy squadron enters radar zone
        if (st.enemies.some((e) => e.y >= 42) && now - st.lastFireTime > 255) {
          st.lastFireTime = now
          st.lasers.push(
            { x: st.jetX - 10, y: jetY - 18, vy: -520 },
            { x: st.jetX + 10, y: jetY - 18, vy: -520 }
          )
          audioService.playLaser()
        }

        // Check wave transition timer
        if (st.waveTransitionUntil > 0 && now >= st.waveTransitionUntil) {
          st.waveTransitionUntil = 0
          spawnWave(st.wave)
        }

        // Move lasers
        for (let i = st.lasers.length - 1; i >= 0; i--) {
          st.lasers[i].y += st.lasers[i].vy * dt
          if (st.lasers[i].y < -20) {
            st.lasers.splice(i, 1)
          }
        }

        // Move enemies & check laser collisions
        let correctPlaneEscaped = false
        for (let i = st.enemies.length - 1; i >= 0; i--) {
          const enemy = st.enemies[i]
          enemy.y += enemy.speed * dt
          if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 5)

          // Check collision with lasers once plane enters combat zone
          let destroyed = false
          if (enemy.y >= 38) {
            for (let j = st.lasers.length - 1; j >= 0; j--) {
              const b = st.lasers[j]
              if (Math.abs(b.x - enemy.x) < 34 && Math.abs(b.y - enemy.y) < 24) {
                st.lasers.splice(j, 1)
                enemy.hp -= 1
                enemy.hitFlash = 1
                spawnExplosion(b.x, b.y, '#38bdf8', 5)

                if (enemy.hp <= 0) {
                  destroyed = true
                  break
                }
              }
            }
          }

          if (destroyed) {
            if (enemy.isCorrect) {
              // TARGET DESTROYED!
              spawnExplosion(enemy.x, enemy.y, '#34d399', 26)
              // Clear remaining decoy planes with mini warp sparks
              st.enemies.forEach((other) => {
                if (other.id !== enemy.id) {
                  spawnExplosion(other.x, other.y, '#6366f1', 10)
                }
              })
              st.enemies = []
              st.lasers = []

              const points = 100 * st.combo
              st.score += points
              st.kills += 1
              const nextCombo = Math.min(8, st.combo + 1)
              st.combo = nextCombo
              st.wave += 1

              st.floatingTexts.push({
                x: enemy.x,
                y: enemy.y,
                text: `+${points}`,
                color: '#34d399',
                life: 0.9,
              })

              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(30)
                } catch {}
              }
              audioService.playCombo(nextCombo)
              audioService.speakAuto(enemy.word.term, 0.95)
              storageService.recordDailyActivity(true)

              setScore(st.score)
              setKills(st.kills)
              setCombo(st.combo)
              setWave(st.wave)

              st.waveTransitionUntil = now + 520
              break
            } else {
              // WRONG PLANE SHOT DOWN!
              spawnExplosion(enemy.x, enemy.y, '#f43f5e', 22)
              st.enemies.splice(i, 1)
              st.damageFlash = 1
              st.combo = 1
              st.lives -= 1

              st.floatingTexts.push({
                x: enemy.x,
                y: enemy.y,
                text: 'BẮN NHẦM! -1 TIM',
                color: '#fb7185',
                life: 1.0,
              })

              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate([80, 40, 80])
                } catch {}
              }
              audioService.playErrorBuzz()

              setCombo(1)
              setLives(st.lives)

              if (st.lives <= 0) {
                triggerGameOver(st.score)
                break
              }
            }
            continue
          }

          // Check if enemy crossed defense line
          if (enemy.y > H - 22) {
            if (enemy.isCorrect) {
              correctPlaneEscaped = true
            }
            st.enemies.splice(i, 1)
          }
        }

        if (correctPlaneEscaped && st.running) {
          st.enemies = []
          st.lasers = []
          st.damageFlash = 1
          st.combo = 1
          st.lives -= 1

          st.floatingTexts.push({
            x: W / 2,
            y: H - 80,
            text: 'LỌT MỤC TIÊU! -1 TIM',
            color: '#fbbf24',
            life: 1.0,
          })

          audioService.playErrorBuzz()
          setCombo(1)
          setLives(st.lives)

          if (st.lives <= 0) {
            triggerGameOver(st.score)
          } else {
            st.waveTransitionUntil = now + 550
          }
        }
      }

      // Update stars, particles, floating texts
      for (const s of st.stars) {
        s.y += s.speed * dt
        if (s.y > H) {
          s.y = 0
          s.x = Math.random() * W
        }
      }

      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i]
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        if (p.life <= 0) st.particles.splice(i, 1)
      }

      for (let i = st.floatingTexts.length - 1; i >= 0; i--) {
        const ft = st.floatingTexts[i]
        ft.y -= 35 * dt
        ft.life -= dt
        if (ft.life <= 0) st.floatingTexts.splice(i, 1)
      }

      if (st.damageFlash > 0) {
        st.damageFlash = Math.max(0, st.damageFlash - dt * 3)
      }

      // 2. Render Scene
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
      bgGrad.addColorStop(0, '#070b19')
      bgGrad.addColorStop(1, '#0f172a')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Subtle lane guides
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.07)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 8])
      ;[0.34, 0.66].forEach((ratio) => {
        ctx.beginPath()
        ctx.moveTo(W * ratio, 0)
        ctx.lineTo(W * ratio, H)
        ctx.stroke()
      })
      ctx.setLineDash([])

      // Stars
      for (const s of st.stars) {
        ctx.fillStyle = `rgba(226, 232, 240, ${s.alpha})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Defense line near bottom
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(12, H - 20)
      ctx.lineTo(W - 12, H - 20)
      ctx.stroke()

      // Lasers
      ctx.fillStyle = '#38bdf8'
      ctx.shadowColor = '#38bdf8'
      ctx.shadowBlur = 8
      for (const b of st.lasers) {
        ctx.fillRect(b.x - 1.8, b.y - 8, 3.6, 15)
      }
      ctx.shadowBlur = 0

      // Enemy Planes & Word Shields
      for (const enemy of st.enemies) {
        ctx.save()
        ctx.translate(enemy.x, enemy.y)

        // Engine glow
        ctx.fillStyle = 'rgba(244, 63, 94, 0.65)'
        ctx.beginPath()
        ctx.arc(0, -18, 5 + Math.sin(now * 0.02) * 1.5, 0, Math.PI * 2)
        ctx.fill()

        // Enemy Swept-Wing Fighter Body (pointing down)
        ctx.fillStyle = enemy.hitFlash > 0.1 ? '#ffffff' : '#334155'
        ctx.strokeStyle = enemy.hitFlash > 0.1 ? '#38bdf8' : '#fb7185'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(0, 20) // Nose pointing down
        ctx.lineTo(24, -6) // Right wingtip
        ctx.lineTo(9, -4)
        ctx.lineTo(6, -16) // Tail right
        ctx.lineTo(-6, -16) // Tail left
        ctx.lineTo(-9, -4)
        ctx.lineTo(-24, -6) // Left wingtip
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Cockpit canopy
        ctx.fillStyle = '#fb7185'
        ctx.beginPath()
        ctx.ellipse(0, 3, 3.5, 7, 0, 0, Math.PI * 2)
        ctx.fill()

        // 3-Segment HP Bar under tail
        const hpWidth = 30
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
        ctx.fillRect(-hpWidth / 2, -25, hpWidth, 4)
        ctx.fillStyle =
          enemy.hp >= 3 ? '#38bdf8' : enemy.hp === 2 ? '#f59e0b' : '#f43f5e'
        ctx.fillRect(-hpWidth / 2, -25, (hpWidth * enemy.hp) / enemy.maxHp, 4)

        // Word Label Tactical Pill below nose so player reads clearly
        const label = enemy.word.term
        const maxPillW = Math.floor(W * 0.31)
        ctx.font = '700 12px system-ui, -apple-system, sans-serif'

        // Split into 2 lines if phrase is wide
        let lines = [label]
        if (ctx.measureText(label).width > maxPillW - 12 && label.includes(' ')) {
          const parts = label.split(' ')
          const mid = Math.ceil(parts.length / 2)
          lines = [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')]
        } else if (ctx.measureText(label).width > maxPillW - 8) {
          ctx.font = '700 10.5px system-ui, -apple-system, sans-serif'
        }

        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
        const pillW = Math.min(maxPillW, Math.max(58, textW + 14))
        const pillH = lines.length > 1 ? 32 : 22
        const pillY = 24

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.65)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 7)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (lines.length === 1) {
          ctx.fillText(lines[0], 0, pillY + pillH / 2)
        } else {
          ctx.fillText(lines[0], 0, pillY + 10)
          ctx.fillText(lines[1], 0, pillY + 23)
        }

        ctx.restore()
      }

      // Player Starfighter
      ctx.save()
      ctx.translate(st.jetX, jetY)

      // Thruster flame
      const flameLen = 11 + Math.sin(now * 0.04) * 4
      const flameGrad = ctx.createLinearGradient(0, 14, 0, 14 + flameLen)
      flameGrad.addColorStop(0, '#38bdf8')
      flameGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.fillStyle = flameGrad
      ctx.beginPath()
      ctx.moveTo(-6, 14)
      ctx.lineTo(0, 14 + flameLen)
      ctx.lineTo(6, 14)
      ctx.closePath()
      ctx.fill()

      // Twin cannons
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(-12, -14, 3, 10)
      ctx.fillRect(9, -14, 3, 10)

      // Starfighter Hull
      ctx.fillStyle = '#e0e7ff'
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -22) // Nose pointing up
      ctx.lineTo(24, 12) // Right wing
      ctx.lineTo(8, 9)
      ctx.lineTo(5, 16)
      ctx.lineTo(-5, 16)
      ctx.lineTo(-8, 9)
      ctx.lineTo(-24, 12) // Left wing
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Cockpit
      ctx.fillStyle = '#4f46e5'
      ctx.beginPath()
      ctx.ellipse(0, -3, 4, 8, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      // Particles
      for (const p of st.particles) {
        const alpha = Math.max(0, p.life / p.maxLife)
        ctx.fillStyle = p.color
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Floating Score / Alert Texts
      for (const ft of st.floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life * 1.4)
        ctx.font = '800 13px system-ui, -apple-system, sans-serif'
        ctx.fillStyle = ft.color
        ctx.textAlign = 'center'
        ctx.fillText(ft.text, ft.x, ft.y)
      }
      ctx.globalAlpha = 1

      // Damage Red Vignette Flash
      if (st.damageFlash > 0) {
        ctx.fillStyle = `rgba(244, 63, 94, ${st.damageFlash * 0.28})`
        ctx.fillRect(0, 0, W, H)
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', updateSize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [spawnWave, startNewGame, triggerGameOver])

  // Pointer / Touch steering on Canvas
  const handlePointerSteer = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relX = clientX - rect.left
    engineRef.current.targetX = Math.max(30, Math.min(rect.width - 30, relX))
  }

  return (
    <div
      className="w-full flex-1 flex flex-col max-w-md mx-auto px-3 py-2 select-none"
      data-no-pull="true"
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => {
            audioService.stopSpeech()
            onBack()
          }}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          title="Thoát trò chơi"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
            Đợt {wave}
          </span>
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {score.toLocaleString()} đ
          </span>
          {combo > 1 && (
            <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
              x{combo}
            </span>
          )}
        </div>

        {/* 3 Hearts */}
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

      {/* Target Meaning Radar Bar */}
      <div className="bg-slate-900 text-white rounded-2xl px-3.5 py-2.5 mb-2 border border-indigo-500/40 shadow-md flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Mục tiêu cần bắn hạ ({deckName})</span>
          </div>
          <div className="text-sm font-bold text-white leading-snug line-clamp-2 mt-0.5">
            {targetWord ? targetWord.definition : 'Đang dò mục tiêu...'}
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

      {/* 60fps Space Combat Arena */}
      <div
        ref={containerRef}
        data-no-pull="true"
        className="flex-1 min-h-[360px] w-full rounded-3xl overflow-hidden relative border-2 border-slate-800 shadow-xl touch-none"
        onTouchStart={(e) => handlePointerSteer(e.touches[0].clientX)}
        onTouchMove={(e) => handlePointerSteer(e.touches[0].clientX)}
        onMouseMove={(e) => {
          if (e.buttons === 1 || !isGameOver) {
            handlePointerSteer(e.clientX)
          }
        }}
        onClick={(e) => handlePointerSteer(e.clientX)}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Subtle Control Hint on Wave 1 */}
        {wave === 1 && !isGameOver && (
          <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
            <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-slate-900/75 text-slate-300 border border-white/10">
              Chạm hoặc kéo ngang để lái phi thuyền bắn đúng từ
            </span>
          </div>
        )}

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-slate-950/88 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-amber-400 flex items-center justify-center mb-3">
              <Trophy className="w-8 h-8" />
            </div>

            {isNewRecord && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                Kỷ lục mới!
              </span>
            )}

            <h3 className="text-xl font-extrabold text-white">Kết thúc Không Chiến</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">
              Đã bắn hạ chuẩn <strong>{kills}</strong> máy bay từ vựng
            </p>

            <div className="w-full max-w-xs grid grid-cols-2 gap-2.5 mb-5">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-lg font-extrabold text-cyan-400">
                  {score.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">Điểm đạt được</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-lg font-extrabold text-amber-400">
                  {bestScore.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">Kỷ lục cao nhất</div>
              </div>
            </div>

            <div className="w-full max-w-xs space-y-2.5">
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
                onClick={onBack}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
              >
                Về Đấu Trường chọn trò khác
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
