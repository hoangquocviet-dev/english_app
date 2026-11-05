import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { audioService } from '../../utils/audio'

interface PullToRefreshProps {
  children: React.ReactNode
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const touchStartYRef = useRef(0)
  const canPullRef = useRef(false)
  const thresholdPassedRef = useRef(false)

  const THRESHOLD = 65
  const MAX_PULL = 110

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only initiate pull when user is scrolled to the very top
      if (window.scrollY > 5 || isRefreshing) {
        canPullRef.current = false
        return
      }

      const target = e.target as HTMLElement | null
      // Do not hijack card swiping, buttons, or form controls
      if (
        target?.closest(
          '[data-no-pull="true"], input, textarea, select, button, .cursor-pointer'
        )
      ) {
        canPullRef.current = false
        return
      }

      touchStartYRef.current = e.touches[0].clientY
      canPullRef.current = true
      setIsDragging(true)
      thresholdPassedRef.current = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!canPullRef.current || isRefreshing) return

      if (window.scrollY > 0) {
        canPullRef.current = false
        setIsDragging(false)
        setPullDistance(0)
        setIsReady(false)
        return
      }

      const currentY = e.touches[0].clientY
      const deltaY = currentY - touchStartYRef.current

      if (deltaY > 0) {
        // Damped logarithmic pull resistance
        const damped = Math.min(MAX_PULL, Math.pow(deltaY, 0.82) * 1.5)
        setPullDistance(damped)

        const ready = damped >= THRESHOLD
        setIsReady(ready)

        // Haptic feedback when crossing the threshold
        if (ready && !thresholdPassedRef.current) {
          thresholdPassedRef.current = true
          if (navigator.vibrate) {
            try {
              navigator.vibrate(15)
            } catch {
              // Ignore vibration errors if unsupported
            }
          }
        } else if (!ready && thresholdPassedRef.current) {
          thresholdPassedRef.current = false
        }

        // Prevent native overscroll bounce if pulling down intentionally
        if (e.cancelable && deltaY > 12) {
          e.preventDefault()
        }
      } else {
        setPullDistance(0)
        setIsReady(false)
      }
    }

    const handleTouchEnd = () => {
      if (!canPullRef.current || isRefreshing) return
      canPullRef.current = false
      setIsDragging(false)

      if (thresholdPassedRef.current || isReady) {
        setIsRefreshing(true)
        setPullDistance(THRESHOLD) // Lock in view while refreshing
        audioService.playClick()

        if (navigator.vibrate) {
          try {
            navigator.vibrate([20, 50, 20])
          } catch {
            // Ignore
          }
        }

        // Brief delay for visual satisfaction before reload
        setTimeout(() => {
          window.location.reload()
        }, 400)
      } else {
        setPullDistance(0)
        setIsReady(false)
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [isReady, isRefreshing])

  const rotation = Math.min(360, (pullDistance / THRESHOLD) * 360)

  return (
    <>
      {/* Floating Pull-to-Refresh Pill */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center px-4"
          style={{
            transform: `translateY(${Math.max(12, pullDistance * 0.75)}px)`,
            transition: isDragging ? 'none' : 'transform 0.25s ease-out',
          }}
        >
          <div
            className={`px-4 py-2 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-2.5 text-xs font-semibold select-none transition-all duration-200 ${
              isRefreshing || isReady
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/25 scale-105'
                : 'bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-slate-900/10 scale-100'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 transition-transform ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              style={
                !isRefreshing
                  ? {
                      transform: `rotate(${rotation}deg)`,
                      transition: isDragging ? 'none' : 'transform 0.2s',
                    }
                  : undefined
              }
            />
            <span>
              {isRefreshing
                ? 'Đang tải lại...'
                : isReady
                ? 'Thả tay để tải lại'
                : 'Kéo xuống để tải lại'}
            </span>
          </div>
        </div>
      )}

      {children}
    </>
  )
}
