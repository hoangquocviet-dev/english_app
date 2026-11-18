/**
 * Checks for any updated PWA Service Worker (with a fast timeout so offline
 * mode never hangs) before reloading the page so users always receive the
 * latest deployed build in a single tap.
 */
export async function forceReloadApp(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    if ('serviceWorker' in navigator) {
      const updateTask = (async () => {
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

      // Never block reload for more than 500ms if offline or on slow network
      await Promise.race([
        updateTask,
        new Promise((resolve) => window.setTimeout(resolve, 500)),
      ])
    }
  } catch {}

  window.location.reload()
}
