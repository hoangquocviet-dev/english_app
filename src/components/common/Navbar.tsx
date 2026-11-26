import { Cloud, Flame, Moon, RotateCw, Sun, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Deck } from '../../types'
import { audioService } from '../../utils/audio'
import { cloudSyncService, type SyncStateSnapshot } from '../../utils/cloudSync'
import { forceReloadApp } from '../../utils/reload'

interface NavbarProps {
  activeDeck: Deck | null
  streak: number
  onGoHome?: () => void
  onOpenDeckSelector?: () => void
  onOpenCloudSync?: () => void
}

export function Navbar({
  activeDeck,
  streak,
  onGoHome,
  onOpenDeckSelector,
  onOpenCloudSync,
}: NavbarProps) {
  const [soundEnabled, setSoundEnabled] = useState(() => audioService.getSoundEnabled())
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  )
  const [isReloading, setIsReloading] = useState(false)
  const [syncState, setSyncState] = useState<SyncStateSnapshot>(() =>
    cloudSyncService.getSnapshot()
  )

  useEffect(() => {
    return cloudSyncService.subscribe(() => {
      setSyncState(cloudSyncService.getSnapshot())
    })
  }, [])

  const toggleSound = () => {
    const next = !audioService.getSoundEnabled()
    setSoundEnabled(next)
    audioService.setSoundEnabled(next)
    if (next) audioService.playClick()
  }

  const toggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains('dark')
    setIsDark(nextDark)
    if (nextDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('vocab_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('vocab_theme', 'light')
    }
    audioService.playClick()
  }

  const handleReload = () => {
    setIsReloading(true)
    audioService.playClick()
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25)
      } catch {}
    }
    setTimeout(() => {
      void forceReloadApp()
    }, 250)
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="w-full max-w-md sm:max-w-xl mx-auto px-3.5 h-14 flex items-center justify-between">
        {/* Brand & Active Deck */}
        <div className="flex items-center gap-2 overflow-hidden mr-1.5 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            title="Về Trang chủ"
            className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center font-bold text-white text-base shadow-sm shrink-0 active:scale-95 transition-transform"
          >
            V
          </button>
          <div className="flex flex-col min-w-0">
            <button
              type="button"
              onClick={onGoHome}
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none text-left"
            >
              VocabFlow
            </button>
            {activeDeck && (
              <button
                onClick={onOpenDeckSelector}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate text-left mt-0.5 hover:underline focus:outline-none max-w-[108px] sm:max-w-[168px]"
              >
                {activeDeck.name}
              </button>
            )}
          </div>
        </div>

        {/* Right Actions: Streak, Cloud ID, Sound, Reload, Theme */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Streak indicator */}
          <div
            title={`Chuỗi học liên tiếp: ${streak} ngày`}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 text-xs font-semibold"
          >
            <Flame className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" />
            <span>{streak}d</span>
          </div>

          {/* Cloud Sync / Recovery ID Button */}
          {onOpenCloudSync && (
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                onOpenCloudSync()
              }}
              aria-label="Mã ID & Đồng bộ Cloud"
              title={`Mã ID: ${syncState.syncCode} (Chạm để sao lưu hoặc chuyển máy)`}
              className="relative h-8 px-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-extrabold flex items-center gap-1 transition-colors active:scale-95"
            >
              <Cloud
                className={`w-3.5 h-3.5 ${syncState.status === 'syncing' ? 'animate-pulse' : ''}`}
              />
              <span>ID</span>
              {syncState.status === 'synced' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
              {syncState.status === 'error' && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              )}
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Bật/Tắt âm thanh"
            title={soundEnabled ? 'Đang bật âm thanh (Chạm để tắt)' : 'Đang tắt âm thanh (Chạm để bật)'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-rose-400" />
            )}
          </button>

          {/* Reload Button */}
          <button
            onClick={handleReload}
            aria-label="Tải lại trang"
            title="Tải lại trang"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Đổi giao diện sáng/tối"
            title="Đổi giao diện Sáng / Tối"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
