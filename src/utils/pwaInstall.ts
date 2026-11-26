export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'vocabflow_pwa_install_dismissed'

class PwaInstallManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private listeners = new Set<() => void>()
  private initialized = false

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferredPrompt = e as BeforeInstallPromptEvent
      this.notify()
    })

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.notify()
    })
  }

  public canInstall(): boolean {
    if (typeof window === 'undefined' || !this.deferredPrompt) return false
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return false
      if (window.matchMedia?.('(display-mode: standalone)').matches) return false
    } catch {}
    return true
  }

  public async triggerInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false
    try {
      await this.deferredPrompt.prompt()
      const choice = await this.deferredPrompt.userChoice
      this.deferredPrompt = null
      this.notify()
      return choice.outcome === 'accepted'
    } catch {
      this.deferredPrompt = null
      this.notify()
      return false
    }
  }

  public dismissBanner(): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DISMISS_KEY, '1')
      } catch {}
    }
    this.notify()
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {}
    }
  }
}

export const pwaInstallManager = new PwaInstallManager()
