import { CheckCircle2, ChevronRight, Keyboard, Layers, Plus, RotateCw, Sparkles } from 'lucide-react'
import type { Deck, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'

interface PracticeHomeProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  onSelectDeck: (deckId: string) => void
  onStartMode: (mode: StudyMode) => void
  onGoToAddWord: () => void
}

export function PracticeHome({
  decks,
  activeDeck,
  words,
  onSelectDeck,
  onStartMode,
  onGoToAddWord,
}: PracticeHomeProps) {
  const masteredCount = words.filter((w) => w.status === 'mastered').length
  const learningCount = words.filter((w) => w.status === 'learning').length
  const newCount = words.filter((w) => w.status === 'new').length

  const handleStart = (mode: StudyMode) => {
    if (words.length === 0) return
    audioService.playClick()
    onStartMode(mode)
  }

  return (
    <div className="w-full flex flex-col max-w-md mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Deck Selector Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
        <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
          Bộ từ vựng đang chọn
        </label>
        <div className="relative">
          <select
            value={activeDeck.id}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} {deck.isBuiltIn ? '(Mặc định)' : ''}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronRight className="w-4 h-4 rotate-90" />
          </div>
        </div>

        {activeDeck.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
            {activeDeck.description}
          </p>
        )}

        {/* Word count stats */}
        <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">{words.length}</div>
            <div className="text-[11px] text-slate-400 font-medium">Tổng từ</div>
          </div>
          <div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{masteredCount}</div>
            <div className="text-[11px] text-slate-400 font-medium">Đã thuộc</div>
          </div>
          <div>
            <div className="text-base font-bold text-amber-600 dark:text-amber-400">{learningCount + newCount}</div>
            <div className="text-[11px] text-slate-400 font-medium">Chưa nhớ</div>
          </div>
        </div>

        {/* Quick Reload Button on Home Page */}
        <button
          onClick={() => {
            audioService.playClick()
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try {
                navigator.vibrate(25)
              } catch {}
            }
            window.location.reload()
          }}
          className="w-full mt-3 py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700/80 transition-all active:scale-98"
          title="Tải lại toàn bộ ứng dụng"
        >
          <RotateCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Làm mới / Tải lại ứng dụng</span>
        </button>
      </div>

      {/* Empty State Guard */}
      {words.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 text-center border border-dashed border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 font-medium">
            Bộ từ này hiện chưa có thẻ từ vựng nào.
          </p>
          <button
            onClick={onGoToAddWord}
            className="py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm từ vựng ngay</span>
          </button>
        </div>
      ) : (
        /* 3 Practice Modes */
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
            Chọn chế độ học
          </div>

          {/* Mode 1: Flashcard 3D */}
          <button
            onClick={() => handleStart('flashcard')}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                  1. Flashcard 3D Cảm ứng
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Vuốt Lên lật thẻ xem nghĩa, vuốt Trái/Phải đánh giá ghi nhớ
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Mode 2: Multiple Choice Quiz */}
          <button
            onClick={() => handleStart('quiz')}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
                  2. Trắc nghiệm 4 đáp án
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Luyện phản xạ nhận diện nghĩa từ vựng tức thì
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Mode 3: Spelling Tiles */}
          <button
            onClick={() => handleStart('spelling')}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Keyboard className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                  3. Ghép chữ cái (Duolingo Style)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Tự động phát âm chuẩn bản xứ ngay khi ghép đúng từ
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}

      {/* Daily Motivation Card */}
      <div className="rounded-2xl p-4 bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-transparent border border-indigo-500/15 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
          Mỗi ngày dành 10 phút luyện tập phản xạ và nghe phát âm để ghi nhớ từ vựng lâu dài.
        </p>
      </div>
    </div>
  )
}
