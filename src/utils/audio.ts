class AudioManager {
  private ctx: AudioContext | null = null
  private voices: SpeechSynthesisVoice[] = []
  private preferredVoice: SpeechSynthesisVoice | null = null
  private isSoundEnabled: boolean = true

  constructor() {
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
      // Find high quality English voices (en-US, en-GB)
      this.preferredVoice =
        this.voices.find(v => (v.lang === 'en-US' || v.lang === 'en_US') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Siri'))) ||
        this.voices.find(v => v.lang.startsWith('en-US')) ||
        this.voices.find(v => v.lang.startsWith('en')) ||
        this.voices[0] ||
        null
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isSoundEnabled = enabled
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

  // Speak word using native SpeechSynthesis
  public speak(text: string, rate: number = 0.9): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve()
        return
      }

      try {
        // Cancel any pending speech
        window.speechSynthesis.cancel()

        const cleanText = text.replace(/[/\\()[\]]/g, '').trim()
        if (!cleanText) {
          resolve()
          return
        }

        const utterance = new SpeechSynthesisUtterance(cleanText)
        utterance.lang = 'en-US'
        utterance.rate = rate
        utterance.pitch = 1.0

        if (this.preferredVoice) {
          utterance.voice = this.preferredVoice
        }

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()

        // Resume AudioContext just in case
        this.getAudioContext()

        window.speechSynthesis.speak(utterance)
      } catch {
        resolve()
      }
    })
  }

  // Stop any active speech
  public stopSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }
}

export const audioService = new AudioManager()
