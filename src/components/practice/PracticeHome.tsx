import {
  CheckCircle2,
  ChevronRight,
  Flame,
  Headphones,
  Keyboard,
  Layers,
  Plus,
  RotateCw,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import type { Deck, StudyFilter, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import type { DailyProgress } from '../../utils/storage'

interface PracticeHomeProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  dailyProgress: DailyProgress
  studyFilter: StudyFilter
  shuffleEnabled: boolean
  onChangeFilter: (filter: StudyFilter) => void
  onToggleShuffle: () => void
  onSelectDeck: (deckId: string) => void
  onStartMode: (mode: StudyMode) => void
  onGoToAddWord: () => void
}

export function PracticeHome({
  decks,
  activeDeck,
  words,
  dailyProgress,
  studyFilter,
  shuffleEnabled,
  onChangeFilter,
  onToggleShuffle,
  onSelectDeck,
  onStartMode,
  onGoToAddWord,
}: PracticeHomeProps) {
  const masteredCount = words.filter((w) => w.status === 'mastered').length
  const unmasteredCount = words.length - masteredCount
  const masteryPercent = words.length > 0 ? Math.round((masteredCount / words.length) * 100) : 0

  const dailyPercent = Math.min(
    100,
    Math.round((dailyProgress.count / Math.max(1, dailyProgress.goal)) * 100)
  )
  const isGoalReached = dailyProgress.count >= dailyProgress.goal

  const handleStart = (mode: StudyMode) => {
    if (words.length === 0) return
    audioService.playClick()
    onStartMode(mode)
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
            <div className="text-[11px] text-slate-400 font-medium">Tổng từ</div>
          </div>
          <div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{masteredCount}</div>
            <div className="text-[11px] text-slate-400 font-medium">Đã thuộc</div>
          </div>
          <div>
            <div className="text-base font-bold text-amber-600 dark:text-amber-400">{unmasteredCount}</div>
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
        <div className="space-y-3">
          {/* Smart Study Scope & Shuffle Bar */}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="inline-flex p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  audioService.playClick()
                  onChangeFilter('all')
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  studyFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tất cả ({words.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  audioService.playClick()
                  onChangeFilter('unmastered')
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  studyFilter === 'unmastered'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Chưa thuộc ({unmasteredCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                onToggleShuffle()
              }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all active:scale-95 ${
                shuffleEnabled
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
              title="Trộn ngẫu nhiên thứ tự thẻ khi học"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Trộn thẻ</span>
            </button>
          </div>

          {studyFilter === 'unmastered' && unmasteredCount === 0 && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              Bạn đã thuộc hết 100% từ trong bộ này! Khi bấm học sẽ tự động ôn lại cả bộ ({words.length} từ).
            </div>
          )}

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
                  Vuốt lật thẻ 3D, nghe câu ví dụ và vuốt Trái/Phải đánh giá
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
                  Luyện phản xạ nhận diện nghĩa và tự động lặp lại từ sai
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

      {/* Daily Motivation Card */}
      <div className="rounded-2xl p-4 bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-transparent border border-indigo-500/15 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
          Mẹo học nhanh: Bật chế độ <strong>Chưa thuộc</strong> kết hợp <strong>Trộn thẻ</strong> để tập trung dứt điểm các từ khó nhớ!
        </p>
      </div>
    </div>
  )
}
