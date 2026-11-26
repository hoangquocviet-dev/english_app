import { useRef } from 'react'
import { audioService } from '../../utils/audio'

interface SheetGrabberProps {
  onDismiss: () => void
}

export function SheetGrabber({ onDismiss }: SheetGrabberProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const deltaYRef = useRef(0)

  return (
    <div
      role="button"
      tabIndex={-1}
      data-testid="sheet-grabber"
      aria-label="Vuốt xuống hoặc chạm để đóng hộp thoại"
      onClick={() => {
        audioService.playClick()
        onDismiss()
      }}
      onTouchStart={(e) => {
        startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        deltaYRef.current = 0
      }}
      onTouchMove={(e) => {
        if (!startRef.current) return
        deltaYRef.current = e.touches[0].clientY - startRef.current.y
      }}
      onTouchEnd={(e) => {
        if (!startRef.current) return
        const endX =
          e.changedTouches.length > 0 ? e.changedTouches[0].clientX : startRef.current.x
        const endY =
          e.changedTouches.length > 0 ? e.changedTouches[0].clientY : startRef.current.y
        const dx = endX - startRef.current.x
        const dy = Math.max(deltaYRef.current, endY - startRef.current.y)
        startRef.current = null
        deltaYRef.current = 0

        if (dy > 36 && dy > Math.abs(dx) * 1.1) {
          audioService.playClick()
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
              navigator.vibrate(15)
            } catch {}
          }
          onDismiss()
        }
      }}
      className="w-full h-6 -mt-2 mb-0.5 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing sm:hidden shrink-0"
    >
      <div className="w-11 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
    </div>
  )
}
