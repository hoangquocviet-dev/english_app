import { Flame, Moon, RotateCw, Sun, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Deck } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface NavbarProps {
  activeDeck: Deck | null
  onOpenDeckSelector?: () => void
}

export function Navbar({ activeDeck, onOpenDeckSelector }: NavbarProps) {
  const [streak, setStreak] = useState(1)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [isReloading, setIsReloading] = useState(false)

  useEffect(() => {
    setStreak(storageService.getStudyStreak())
    setSoundEnabled(audioService.getSoundEnabled())

    // Initial theme detection
    const isDarkMode = document.documentElement.classList.contains('dark')
    setIsDark(isDarkMode)
  }, [])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    audioService.setSoundEnabled(next)
    if (next) audioService.playClick()
  }

  const toggleTheme = () => {
    const nextDark = !isDark
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
      window.location.reload()
    }, 300)
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="w-full max-w-md mx-auto px-3.5 h-14 flex items-center justify-between">
        {/* Brand & Active Deck */}
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center font-bold text-white text-base shadow-sm shrink-0">
            V
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
              VocabFlow
            </span>
            {activeDeck && (
              <button
                onClick={onOpenDeckSelector}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate text-left mt-0.5 hover:underline focus:outline-none max-w-[130px] sm:max-w-[180px]"
              >
                {activeDeck.name}
              </button>
            )}
          </div>
        </div>

        {/* Right Actions: Streak, Sound, Theme */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Streak indicator */}
          <div
            title={`Chuỗi học: ${streak} ngày`}
            className="flex items-center gap-1 px-1.5 py-1 rounded-full bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 text-xs font-semibold"
          >
            <Flame className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" />
            <span>{streak}d</span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Bật/Tắt âm thanh"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400 dark:text-slate-600" />
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
