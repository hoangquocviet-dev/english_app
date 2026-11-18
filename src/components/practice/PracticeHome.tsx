import {
  CheckCircle2,
  ChevronRight,
  Flame,
  Headphones,
  Keyboard,
  Layers,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import type { Deck, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import type { DailyProgress } from '../../utils/storage'

interface PracticeHomeProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  dailyProgress: DailyProgress
  shuffleEnabled: boolean
  onToggleShuffle: () => void
  onSelectDeck: (deckId: string) => void
  onResetDeck: (deckId: string) => void
  onStartMode: (mode: StudyMode) => void
  onGoToAddWord: () => void
}

export function PracticeHome({
  decks,
  activeDeck,
  words,
  dailyProgress,
  shuffleEnabled,
  onToggleShuffle,
  onSelectDeck,
  onResetDeck,
  onStartMode,
  onGoToAddWord,
}: PracticeHomeProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const masteredCount = words.filter((w) => w.status === 'mastered').length
  const unmasteredCount = words.length - masteredCount
  const masteryPercent = words.length > 0 ? Math.round((masteredCount / words.length) * 100) : 0

  const dailyPercent = Math.min(
    100,
    Math.round((dailyProgress.count / Math.max(1, dailyProgress.goal)) * 100)
  )
  const isGoalReached = dailyProgress.count >= dailyProgress.goal

  const handleStart = (mode: StudyMode) => {
    if (unmasteredCount === 0) return
    audioService.playClick()
    onStartMode(mode)
  }

  const handleConfirmReset = () => {
    audioService.playSuccessChime()
    onResetDeck(activeDeck.id)
    setShowResetConfirm(false)
  }

  return (
    <div className="w-full flex flex-col max-w-md mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Daily Goal Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isGoalReached
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block leading-none">
                Mục tiêu hôm nay
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isGoalReached
                  ? 'Xuất sắc! Bạn đã hoàn thành mục tiêu ngày'
                  : 'Duy trì đều đặn mỗi ngày để nhớ sâu'}
              </span>
            </div>
          </div>
          <span
            className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
              isGoalReached
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {dailyProgress.count} / {dailyProgress.goal} lượt
          </span>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isGoalReached
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 to-sky-500'
            }`}
            style={{ width: `${dailyPercent}%` }}
          />
        </div>
      </div>

      {/* Deck Selector Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Bộ từ vựng đang chọn
          </label>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            Thuộc {masteryPercent}%
          </span>
        </div>

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

        {/* Deck Mastery Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden mt-3">
          <div
            className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
            style={{ width: `${masteryPercent}%` }}
          />
        </div>

        {/* Word count stats */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">{words.length}</div>
            <div className="text-[11px] text-slate-400 font-medium">Tổng thẻ</div>
          </div>
          <div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{masteredCount}</div>
            <div className="text-[11px] text-slate-400 font-medium">Đã thuộc (Ẩn)</div>
          </div>
          <div>
            <div className="text-base font-bold text-amber-600 dark:text-amber-400">{unmasteredCount}</div>
            <div className="text-[11px] text-slate-400 font-medium">Cần học</div>
          </div>
        </div>

        {/* Action Buttons Row: Reset Deck (when mastered > 0) + Reload App */}
        <div className={`grid gap-2 mt-3 ${masteredCount > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {masteredCount > 0 && (
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                setShowResetConfirm(true)
              }}
              className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 border border-amber-500/25 transition-all active:scale-98"
              title="Hiện lại các thẻ đã thuộc để học lại từ đầu"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Reset học lại ({masteredCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(25)
                } catch {}
              }
              window.location.reload()
            }}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700/80 transition-all active:scale-98"
            title="Tải lại toàn bộ ứng dụng"
          >
            <RotateCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Tải lại trang</span>
          </button>
        </div>
      </div>

      {/* Empty State / Completed 100% State / Active Study Modes */}
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
      ) : unmasteredCount === 0 ? (
        /* All Cards Mastered & Hidden State */
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center border border-emerald-500/30 shadow-xs space-y-3 animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
            <Trophy className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Bạn đã thuộc hết {words.length}/{words.length} thẻ!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Các thẻ đã vuốt <strong>Đã thuộc</strong> đã được ẩn đi để không hiện lặp lại nữa. Bạn có thể chuyển sang học chủ đề khác, hoặc bấm nút Reset bên dưới nếu muốn hiện lại toàn bộ thẻ để ôn từ đầu.
          </p>
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setShowResetConfirm(true)
            }}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset bộ từ để học lại từ đầu</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header & Shuffle Toggle */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Chọn chế độ học ({unmasteredCount} thẻ cần học)
            </span>

            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                onToggleShuffle()
              }}
              className={`py-1.5 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all active:scale-95 ${
                shuffleEnabled
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
              title="Trộn ngẫu nhiên thứ tự thẻ chưa thuộc"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Trộn thẻ</span>
            </button>
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
                  Thẻ vuốt Đã thuộc sẽ tự ẩn đi, chỉ giữ lại thẻ chưa nhớ
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
                  Luyện phản xạ nhận diện nghĩa cho các thẻ chưa thuộc
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
                  Xếp chữ cái thông minh theo cụm từ, có hỗ trợ gợi ý từng chữ
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Mode 4: Listening Mode */}
          <button
            onClick={() => handleStart('listening')}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-violet-500/50 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors truncate">
                    4. Luyện nghe phản xạ
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400 shrink-0">
                    MỚI
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Nghe phát âm chuẩn & chậm 0.6x để nhận diện từ vựng bằng tai
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}

      {/* Daily Tip Card */}
      <div className="rounded-2xl p-4 bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-transparent border border-indigo-500/15 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
          Thẻ bạn đánh dấu <strong>Đã thuộc</strong> sẽ tự động ẩn đi. Bất cứ lúc nào muốn ôn lại toàn bộ, chỉ cần bấm nút <strong>Reset học lại</strong>!
        </p>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Reset bộ từ để học lại?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Toàn bộ <strong>{masteredCount} thẻ đã thuộc</strong> trong bộ <strong>"{activeDeck.name}"</strong> sẽ được hiện trở lại để bạn học lại từ đầu.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
              >
                Đồng ý Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
