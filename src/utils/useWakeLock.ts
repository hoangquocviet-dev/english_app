import { useEffect } from 'react'

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (
      !enabled ||
      typeof navigator === 'undefined' ||
      typeof document === 'undefined' ||
      !('wakeLock' in navigator) ||
      typeof navigator.wakeLock?.request !== 'function'
    ) {
      return
    }

    let active = true
    let sentinel: WakeLockSentinel | null = null

    const acquire = () => {
      if (!active || document.hidden || typeof navigator.wakeLock?.request !== 'function') return
      void navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (!active) {
            void lock.release().catch(() => {})
            return
          }
          sentinel = lock
        })
        .catch(() => {})
    }

    acquire()

    const onVisibilityChange = () => {
      if (!document.hidden && active && !sentinel) {
        acquire()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (sentinel) {
        const toRelease = sentinel
        sentinel = null
        void toRelease.release().catch(() => {})
      }
    }
  }, [enabled])
}
