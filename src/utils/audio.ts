const SOUND_STORAGE_KEY = 'vocabflow_sound_enabled'
const VOICE_ACCENT_STORAGE_KEY = 'vocabflow_voice_accent'

export type VoiceAccent = 'en-US' | 'en-GB'

class AudioManager {
  private ctx: AudioContext | null = null
  private voices: SpeechSynthesisVoice[] = []
  private preferredVoiceUS: SpeechSynthesisVoice | null = null
  private preferredVoiceGB: SpeechSynthesisVoice | null = null
  private voiceAccent: VoiceAccent = 'en-US'
  private isSoundEnabled: boolean = true
  private activeUtterance: SpeechSynthesisUtterance | null = null
  private activeResolve: (() => void) | null = null
  private activeTimer: number | null = null
  private accentListeners = new Set<() => void>()

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(SOUND_STORAGE_KEY)
        if (saved !== null) {
          this.isSoundEnabled = saved !== 'false'
        }
        const savedAccent = window.localStorage.getItem(VOICE_ACCENT_STORAGE_KEY)
        if (savedAccent === 'en-GB' || savedAccent === 'en-US') {
          this.voiceAccent = savedAccent
        }
      } catch {}
    }
    this.initVoices()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.initVoices()
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  private initVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    this.voices = window.speechSynthesis.getVoices()
    if (this.voices.length > 0) {
      this.preferredVoiceUS =
        this.voices.find(
          (v) =>
            (v.lang === 'en-US' || v.lang === 'en_US') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Siri'))
        ) ||
        this.voices.find((v) => v.lang.startsWith('en-US') || v.lang.startsWith('en_US')) ||
        this.voices.find((v) => v.lang.startsWith('en')) ||
        this.voices[0] ||
        null

      this.preferredVoiceGB =
        this.voices.find(
          (v) =>
            (v.lang === 'en-GB' || v.lang === 'en_GB') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Daniel') ||
              v.name.includes('Libby') ||
              v.name.includes('Siri'))
        ) ||
        this.voices.find((v) => v.lang.startsWith('en-GB') || v.lang.startsWith('en_GB')) ||
        this.preferredVoiceUS
    }
  }

  public getVoiceAccent(): VoiceAccent {
    return this.voiceAccent
  }

  public setVoiceAccent(accent: VoiceAccent): void {
    this.voiceAccent = accent
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(VOICE_ACCENT_STORAGE_KEY, accent)
      } catch {}
    }
    for (const fn of this.accentListeners) {
      try {
        fn()
      } catch {}
    }
  }

  public toggleVoiceAccent(): VoiceAccent {
    const next: VoiceAccent = this.voiceAccent === 'en-US' ? 'en-GB' : 'en-US'
    this.setVoiceAccent(next)
    return next
  }

  public subscribeAccent(listener: () => void): () => void {
    this.accentListeners.add(listener)
    return () => {
      this.accentListeners.delete(listener)
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isSoundEnabled = enabled
    if (!enabled) {
      this.stopSpeech()
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled))
      } catch {}
    }
  }

  public getSoundEnabled(): boolean {
    return this.isSoundEnabled
  }

  // Play subtle UI button click
  public playClick(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.04)

      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.04)
    } catch {
      // Audio error suppressed safely
    }
  }

  // Play pleasant 2-tone success chime (Duolingo style)
  public playSuccessChime(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      // First note: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.12, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.2)

      // Second note: A5 (880 Hz)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.1)
      gain2.gain.setValueAtTime(0.15, now + 0.1)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.1)
      osc2.stop(now + 0.45)
    } catch {
      // Audio error suppressed safely
    }
  }

  // Play low buzz sound for wrong answers
  public playErrorBuzz(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(140, now)
      osc.frequency.linearRampToValueAtTime(110, now + 0.25)

      gain.gain.setValueAtTime(0.1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.25)
    } catch {
      // Audio error suppressed safely
    }
  }

  // Arcade Laser Pew (Sky Defender)
  public playLaser(overdrive = false): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = overdrive ? 'sawtooth' : 'triangle'
      osc.frequency.setValueAtTime(overdrive ? 980 : 820, now)
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.06)

      gain.gain.setValueAtTime(0.045, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.06)
    } catch {}
  }

  // Synthesized Arcade Explosion (noise + low-end punch)
  public playExplosion(isBoss = false): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const duration = isBoss ? 0.45 : 0.22

      // Sub-bass impact punch
      const sub = ctx.createOscillator()
      const subGain = ctx.createGain()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(isBoss ? 150 : 190, now)
      sub.frequency.exponentialRampToValueAtTime(36, now + duration)
      subGain.gain.setValueAtTime(isBoss ? 0.22 : 0.14, now)
      subGain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      sub.connect(subGain)
      subGain.connect(ctx.destination)
      sub.start(now)
      sub.stop(now + duration)

      // Filtered white-noise burst
      const bufferSize = Math.floor(ctx.sampleRate * duration)
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1
      }
      const whiteNoise = ctx.createBufferSource()
      whiteNoise.buffer = noiseBuffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(isBoss ? 1400 : 1100, now)
      filter.frequency.exponentialRampToValueAtTime(180, now + duration)

      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(isBoss ? 0.16 : 0.09, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration)

      whiteNoise.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(ctx.destination)
      whiteNoise.start(now)
      whiteNoise.stop(now + duration)
    } catch {}
  }

  // Shield charge / power-up arpeggio
  public playPowerup(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        const t = now + idx * 0.045
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0.09, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.14)
      })
    } catch {}
  }

  // Energy Shield absorb sound
  public playShieldBlock(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.16)
      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.18)
    } catch {}
  }

  // Subtle urgent countdown tick for final seconds
  public playCountdownTick(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(960, now)
      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.035)
    } catch {}
  }

  // Boss Incoming Warning Siren
  public playBossWarning(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const t = now + i * 0.22
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(240, t)
        osc.frequency.linearRampToValueAtTime(420, t + 0.14)
        osc.frequency.linearRampToValueAtTime(220, t + 0.2)
        gain.gain.setValueAtTime(0.07, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.21)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.21)
      }
    } catch {}
  }

  // Subtle crisp shield-impact tick when a laser bolt hits an enemy hull
  public playHitTick(): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(1150, now)
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.03)

      gain.gain.setValueAtTime(0.045, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.03)
    } catch {}
  }

  // Arcade Ascending Combo Chime (Speed Match & Blitz)
  public playCombo(combo: number = 1): void {
    if (!this.isSoundEnabled) return
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const baseFreq = 523.25 * Math.min(1.8, 1 + Math.max(0, combo - 1) * 0.08)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(baseFreq, now)
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.14)

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.18)
    } catch {}
  }

  private clearActiveSpeechState(): void {
    if (this.activeTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.activeTimer)
      this.activeTimer = null
    }
    this.activeUtterance = null
    if (this.activeResolve) {
      const done = this.activeResolve
      this.activeResolve = null
      done()
    }
  }

  // Speak word using native SpeechSynthesis (with GC pin + anti-hang timeout + US/UK accent)
  public speak(text: string, rate: number = 0.9): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve()
        return
      }

      try {
        this.clearActiveSpeechState()
        window.speechSynthesis.cancel()

        const cleanText = text.replace(/[/\\()[\]]/g, '').trim()
        if (!cleanText) {
          resolve()
          return
        }

        const utterance = new SpeechSynthesisUtterance(cleanText)
        utterance.lang = this.voiceAccent
        utterance.rate = rate
        utterance.pitch = 1.0

        const chosenVoice =
          this.voiceAccent === 'en-GB'
            ? this.preferredVoiceGB || this.preferredVoiceUS
            : this.preferredVoiceUS || this.preferredVoiceGB

        if (chosenVoice) {
          utterance.voice = chosenVoice
        }

        this.activeUtterance = utterance
        this.activeResolve = resolve

        const safetyMs = Math.max(3500, Math.round((cleanText.length * 125) / Math.max(0.5, rate)))
        this.activeTimer = window.setTimeout(() => {
          if (this.activeUtterance === utterance) {
            this.clearActiveSpeechState()
          }
        }, safetyMs)

        utterance.onend = () => {
          if (this.activeUtterance === utterance) {
            this.clearActiveSpeechState()
          }
        }
        utterance.onerror = () => {
          if (this.activeUtterance === utterance) {
            this.clearActiveSpeechState()
          }
        }

        this.getAudioContext()
        window.speechSynthesis.speak(utterance)
      } catch {
        this.clearActiveSpeechState()
        resolve()
      }
    })
  }

  // Auto-speak only when sound is enabled (respects mute button)
  public speakAuto(text: string, rate: number = 0.9): Promise<void> {
    if (!this.isSoundEnabled) return Promise.resolve()
    return this.speak(text, rate)
  }

  // Stop any active speech
  public stopSpeech(): void {
    this.clearActiveSpeechState()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
  }
}

export const audioService = new AudioManager()
