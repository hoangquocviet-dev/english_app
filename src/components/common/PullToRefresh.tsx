import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { audioService } from '../../utils/audio'
import { forceReloadApp } from '../../utils/reload'

interface PullToRefreshProps {
  disabled?: boolean
  children: React.ReactNode
}

export function PullToRefresh({ disabled = false, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const canPullRef = useRef(false)
  const thresholdPassedRef = useRef(false)

  const THRESHOLD = 55
  const MAX_PULL = 110

  useEffect(() => {
    if (disabled) {
      canPullRef.current = false
      return
    }

    const getPageScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0

    const handleTouchStart = (e: TouchEvent) => {
      // Only initiate pull when user is scrolled to the very top
      if (getPageScrollTop() > 5 || isRefreshing || e.touches.length !== 1) {
        canPullRef.current = false
        return
      }

      const target = e.target as HTMLElement | null
      // Do not hijack modals, fixed overlays, games canvas, card swiping, or form controls
      if (
        target?.closest(
          '[role="dialog"], [data-no-pull="true"], .fixed, input, textarea, select, canvas'
        )
      ) {
        canPullRef.current = false
        return
      }

      // Do not hijack inner vertical OR horizontal scrollable containers (e.g. Deck Carousels & Filter Pills)
      let node: HTMLElement | null = target
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.scrollHeight > node.clientHeight + 2 && node.scrollTop > 0) {
          canPullRef.current = false
          return
        }
        const style = window.getComputedStyle(node)
        const overflowX = style.overflowX
        if (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 4
        ) {
          canPullRef.current = false
          return
        }
        node = node.parentElement
      }

      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
      canPullRef.current = true
      thresholdPassedRef.current = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!canPullRef.current || isRefreshing || e.touches.length === 0) return

      if (getPageScrollTop() > 0) {
        canPullRef.current = false
        setIsDragging(false)
        setPullDistance(0)
        setIsReady(false)
        return
      }

      const deltaX = e.touches[0].clientX - touchStartXRef.current
      const deltaY = e.touches[0].clientY - touchStartYRef.current

      // Abort immediately if the user is swiping horizontally rather than pulling straight down
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 0.75) {
        canPullRef.current = false
        setIsDragging(false)
        setPullDistance(0)
        setIsReady(false)
        return
      }

      if (deltaY > 0) {
        setIsDragging(true)
        // Damped logarithmic pull resistance
        const damped = Math.min(MAX_PULL, Math.pow(deltaY, 0.82) * 1.6)
        setPullDistance(damped)

        const ready = damped >= THRESHOLD
        setIsReady(ready)

        // Haptic feedback when crossing the threshold
        if (ready && !thresholdPassedRef.current) {
          thresholdPassedRef.current = true
          if (navigator.vibrate) {
            try {
              navigator.vibrate(15)
            } catch {}
          }
        } else if (!ready && thresholdPassedRef.current) {
          thresholdPassedRef.current = false
        }

        // Prevent native overscroll bounce if pulling down intentionally
        if (e.cancelable && deltaY > 10) {
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
        setPullDistance(THRESHOLD)
        audioService.playClick()

        if (navigator.vibrate) {
          try {
            navigator.vibrate([20, 50, 20])
          } catch {}
        }

        setTimeout(() => {
          void forceReloadApp()
        }, 320)
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
  }, [disabled, isReady, isRefreshing])

  const rotation = Math.min(360, (pullDistance / THRESHOLD) * 360)

  return (
    <>
      {/* Floating Pull-to-Refresh Pill */}
      {!disabled && (pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center px-4"
          style={{
            transform: `translateY(${Math.max(12, pullDistance * 0.75)}px)`,
            transition: isDragging ? 'none' : 'transform 0.25s ease-out',
          }}
        >
          <div
            className={`px-4 py-2 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-2.5 text-xs font-semibold select-none transition-all duration-200 ${
              isReady || isRefreshing
                ? 'bg-indigo-600/95 text-white border-indigo-400/50 shadow-indigo-500/25'
                : 'bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              style={!isRefreshing ? { transform: `rotate(${rotation}deg)` } : undefined}
            />
            <span>
              {isRefreshing
                ? 'Đang cập nhật ứng dụng...'
                : isReady
                ? 'Thả tay để tải lại'
                : 'Kéo xuống để cập nhật'}
            </span>
          </div>
        </div>
      )}

      {children}
    </>
  )
}
