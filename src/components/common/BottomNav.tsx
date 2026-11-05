import { BookOpen, Layers, PlusCircle } from 'lucide-react'
import type { ActiveTab } from '../../types'
import { audioService } from '../../utils/audio'

interface BottomNavProps {
  currentTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
}

export function BottomNav({ currentTab, onTabChange }: BottomNavProps) {
  const tabs = [
    {
      id: 'practice' as ActiveTab,
      label: 'Luyện tập',
      icon: Layers,
    },
    {
      id: 'add' as ActiveTab,
      label: 'Thêm từ',
      icon: PlusCircle,
    },
    {
      id: 'library' as ActiveTab,
      label: 'Kho từ',
      icon: BookOpen,
    },
  ]

  const handleSelect = (tab: ActiveTab) => {
    if (tab !== currentTab) {
      audioService.playClick()
      onTabChange(tab)
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="max-w-md mx-auto grid grid-cols-3 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = currentTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleSelect(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 transition-colors relative focus:outline-none ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[11px] leading-none tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
