import { cloudSyncService } from './cloudSync'
import { storageService } from './storage'

/**
 * Flushes any pending in-memory vocabulary/Cloud Sync writes, checks for an
 * updated PWA Service Worker (with a fast 500ms timeout so offline mode never
 * hangs), and reloads the page cleanly.
 */
export async function forceReloadApp(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    storageService.flushPendingWrites()
  } catch {}

  try {
    const tasks: Array<Promise<unknown>> = []

    if (cloudSyncService.hasPendingPush()) {
      tasks.push(cloudSyncService.pushNow(false, true).catch(() => {}))
    }

    if ('serviceWorker' in navigator) {
      tasks.push(
        (async () => {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(
            registrations.map(async (reg) => {
              try {
                await reg.update()
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
                }
              } catch {}
            })
          )
        })()
      )
    }

    if (tasks.length > 0) {
      await Promise.race([
        Promise.all(tasks),
        new Promise((resolve) => window.setTimeout(resolve, 550)),
      ])
    }
  } catch {}

  window.location.reload()
}
