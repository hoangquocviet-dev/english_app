import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  Headphones,
  Keyboard,
  Layers,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import type { Deck, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import type { DailyProgress } from '../../utils/storage'

const DAILY_GOAL_PRESETS = [10, 20, 30, 50]

interface PracticeHomeProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  allWords?: WordItem[]
  isSeedLoading?: boolean
  dailyProgress: DailyProgress
  shuffleEnabled: boolean
  batchSize: number
  onToggleShuffle: () => void
  onChangeBatchSize: (size: number) => void
  onChangeDailyGoal: (goal: number) => void
  onSelectDeck: (deckId: string) => void
  onResetDeck: (deckId: string) => void
  onStartMode: (
    mode: StudyMode,
    filterMode?: 'all' | 'learning' | 'due' | 'global-due'
  ) => void
  onGoToAddWord: () => void
  onGoToLibrary: () => void
}

export function PracticeHome({
  decks,
  activeDeck,
  words,
  allWords = [],
  isSeedLoading = false,
  dailyProgress,
  shuffleEnabled,
  batchSize,
  onToggleShuffle,
  onChangeBatchSize,
  onChangeDailyGoal,
  onSelectDeck,
  onResetDeck,
  onStartMode,
  onGoToAddWord,
  onGoToLibrary,
}: PracticeHomeProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'learning' | 'due' | 'global-due'>('all')

  const masteredCount = words.filter((w) => w.status === 'mastered').length
  const learningCount = words.filter((w) => w.status === 'learning').length
  const unmasteredCount = words.length - masteredCount

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const dueReviewCount = words.filter(
    (w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= now)
  ).length

  // Cross-deck SRS radar: find if OTHER decks have mastered cards due for spaced repetition!
  const otherDueSummary = (() => {
    const countsByDeck = new Map<string, number>()
    for (const w of allWords) {
      if (
        w.deckId !== activeDeck.id &&
        w.status === 'mastered' &&
        (!w.nextReview || w.nextReview <= now)
      ) {
        countsByDeck.set(w.deckId, (countsByDeck.get(w.deckId) || 0) + 1)
      }
    }
    let topDeckId: string | null = null
    let topCount = 0
    let totalOtherDue = 0
    for (const [dId, cnt] of countsByDeck.entries()) {
      totalOtherDue += cnt
      if (cnt > topCount) {
        topCount = cnt
        topDeckId = dId
      }
    }
    const topDeck = topDeckId ? decks.find((d) => d.id === topDeckId) || null : null
    return { totalOtherDue, topDeck, topCount }
  })()

  const totalGlobalDue = dueReviewCount + otherDueSummary.totalOtherDue

  let effectiveFilterMode: 'all' | 'learning' | 'due' | 'global-due' = 'all'
  let activePoolCount = unmasteredCount

  if (filterMode === 'global-due' && totalGlobalDue > 0) {
    effectiveFilterMode = 'global-due'
    activePoolCount = totalGlobalDue
  } else if (filterMode === 'due' && dueReviewCount > 0) {
    effectiveFilterMode = 'due'
    activePoolCount = dueReviewCount
  } else if (filterMode === 'learning' && learningCount > 0) {
    effectiveFilterMode = 'learning'
    activePoolCount = learningCount
  } else if (unmasteredCount === 0 && dueReviewCount > 0) {
    effectiveFilterMode = 'due'
    activePoolCount = dueReviewCount
  } else if (unmasteredCount === 0 && totalGlobalDue > 0) {
    effectiveFilterMode = 'global-due'
    activePoolCount = totalGlobalDue
  } else {
    effectiveFilterMode = 'all'
    activePoolCount = unmasteredCount
  }

  const masteryPercent = words.length > 0 ? Math.round((masteredCount / words.length) * 100) : 0

  const dailyPercent = Math.min(
    100,
    Math.round((dailyProgress.count / Math.max(1, dailyProgress.goal)) * 100)
  )
  const isGoalReached = dailyProgress.count >= dailyProgress.goal

  const handleCycleGoal = () => {
    audioService.playClick()
    const curIdx = DAILY_GOAL_PRESETS.indexOf(dailyProgress.goal)
    const nextGoal = DAILY_GOAL_PRESETS[(curIdx + 1) % DAILY_GOAL_PRESETS.length]
    onChangeDailyGoal(nextGoal)
  }

  const handleStart = (mode: StudyMode) => {
    if (activePoolCount === 0) return
    audioService.playClick()
    onStartMode(mode, effectiveFilterMode)
  }

  const handleConfirmReset = () => {
    audioService.playSuccessChime()
    onResetDeck(activeDeck.id)
    setShowResetConfirm(false)
  }

  return (
    <div className="w-full flex flex-col max-w-md sm:max-w-xl mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Global Cross-Deck SRS Alert when other decks have due words */}
      {otherDueSummary.totalOtherDue > 0 && otherDueSummary.topDeck && effectiveFilterMode !== 'global-due' && (
        <div className="rounded-2xl p-3 bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2.5 animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 truncate">
                Có {totalGlobalDue} từ đến hạn ôn SRS toàn kho!
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                Riêng "{otherDueSummary.topDeck.name}" có {otherDueSummary.topCount} thẻ đến chu kỳ nhắc lại
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setFilterMode('global-due')
            }}
            className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap shrink-0 active:scale-95 transition-transform"
          >
            Ôn gộp ngay
          </button>
        </div>
      )}
      {/* Daily Goal Card (Interactive Goal Selector) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isGoalReached
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block leading-none">
                Mục tiêu hôm nay
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block mt-0.5">
                {isGoalReached
                  ? 'Xuất sắc! Đã đạt mục tiêu ngày'
                  : 'Chạm số lượt để đổi mục tiêu'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCycleGoal}
            title="Chạm để đổi mục tiêu ngày (10 / 20 / 30 / 50 lượt)"
            className={`text-xs font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-transform active:scale-95 ${
              isGoalReached
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {dailyProgress.count} / {dailyProgress.goal} lượt
          </button>
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
            onChange={(e) => {
              setFilterMode('all')
              onSelectDeck(e.target.value)
            }}
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

        {/* Purposeful Quick Actions: View Deck Words + Reset (or Add Word) */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              onGoToLibrary()
            }}
            className="py-2 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700/80 whitespace-nowrap transition-all active:scale-98"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Danh sách thẻ</span>
          </button>

          {masteredCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                setShowResetConfirm(true)
              }}
              className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 border border-amber-500/25 whitespace-nowrap transition-all active:scale-98"
              title="Hiện lại các thẻ đã thuộc để học lại từ đầu"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Reset ({masteredCount})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                onGoToAddWord()
              }}
              className="py-2 px-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5 border border-indigo-500/20 whitespace-nowrap transition-all active:scale-98"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Thêm từ mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State / Completed 100% State / Active Study Modes */}
      {words.length === 0 ? (
        isSeedLoading ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3">
            <div className="w-6 h-6 rounded-full border-3 border-indigo-500/30 border-t-indigo-500 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Đang đồng bộ kho từ vựng thông minh...
            </p>
          </div>
        ) : (
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
        )
      ) : unmasteredCount === 0 && totalGlobalDue === 0 ? (
        /* All Cards Mastered & None Due */
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center border border-emerald-500/30 shadow-xs space-y-3 animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
            <Trophy className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Bạn đã thuộc hết {words.length}/{words.length} thẻ!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Các thẻ đã vuốt <strong>Đã thuộc</strong> đã được ẩn đi để không hiện lặp lại nữa. Hệ thống ôn tập ngắt quãng (SRS) sẽ tự động nhắc lại khi đến hạn. Bạn có thể chuyển sang học chủ đề khác, hoặc bấm nút Reset bên dưới nếu muốn hiện lại toàn bộ thẻ để ôn từ đầu.
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
          {/* SRS Due Notification Banner */}
          {(effectiveFilterMode === 'due' || effectiveFilterMode === 'global-due') && (
            <div className="rounded-2xl p-3.5 bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2.5 animate-fadeIn">
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-snug">
                  {effectiveFilterMode === 'global-due' ? (
                    <>
                      Đang chọn <strong>Ôn gộp SRS toàn kho ({totalGlobalDue} thẻ)</strong> xuyên suốt mọi bộ từ. Hãy bấm 1 trong 5 chế độ bên dưới để bắt đầu!
                    </>
                  ) : (
                    <>
                      Đang ôn tập ngắt quãng (SRS) cho <strong>{dueReviewCount} thẻ</strong> đã đến chu kỳ nhắc lại để củng cố trí nhớ dài hạn.
                    </>
                  )}
                </p>
              </div>
              {effectiveFilterMode === 'global-due' && unmasteredCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className="py-1 px-2.5 rounded-lg bg-white/80 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0"
                >
                  Về bộ hiện tại
                </button>
              )}
            </div>
          )}

          {/* Clean Header: Section Label + Shuffle Toggle */}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Chế độ học ({activePoolCount} thẻ)
            </span>

            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                onToggleShuffle()
              }}
              className={`py-1 px-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all active:scale-95 ${
                shuffleEnabled
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
              title="Trộn ngẫu nhiên thứ tự thẻ chưa thuộc"
            >
              <Shuffle className="w-3.5 h-3.5 shrink-0" />
              <span>Trộn</span>
            </button>
          </div>

          {/* Dedicated Filter Pills Row (Eliminates horizontal squishing on 360px) */}
          {(totalGlobalDue > 0 || learningCount > 0) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  audioService.playClick()
                  setFilterMode('all')
                }}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all active:scale-95 ${
                  effectiveFilterMode === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-2xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Tất cả ({unmasteredCount})
              </button>

              {dueReviewCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setFilterMode((prev) => (prev === 'due' ? 'all' : 'due'))
                  }}
                  title="Ôn tập ngắt quãng (SRS): các thẻ đã thuộc đến chu kỳ cần nhắc lại"
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 ${
                    effectiveFilterMode === 'due'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 border-indigo-500/35 text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Đến hạn ({dueReviewCount})</span>
                </button>
              )}

              {otherDueSummary.totalOtherDue > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setFilterMode((prev) => (prev === 'global-due' ? 'all' : 'global-due'))
                  }}
                  title="Ôn gộp toàn bộ thẻ SRS đến hạn trên tất cả các bộ từ"
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 ${
                    effectiveFilterMode === 'global-due'
                      ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 border-violet-500/35 text-violet-600 dark:text-violet-400'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>SRS Toàn kho ({totalGlobalDue})</span>
                </button>
              )}

              {learningCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    setFilterMode((prev) => (prev === 'learning' ? 'all' : 'learning'))
                  }}
                  title="Chỉ lọc riêng những từ bạn từng trả lời sai hoặc đánh dấu Chưa nhớ"
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 ${
                    effectiveFilterMode === 'learning'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 border-amber-500/35 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Từ khó ({learningCount})</span>
                </button>
              )}
            </div>
          )}

          {/* Clean Row 2: Full-width Segmented Batch Selector when > 25 cards */}
          {activePoolCount > 25 && (
            <div className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Số thẻ mỗi lượt:
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-0.5 text-[11px] font-bold">
                {[
                  { label: '25 thẻ', value: 25 },
                  { label: '50 thẻ', value: 50 },
                  { label: `Tất cả (${activePoolCount})`, value: 0 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      audioService.playClick()
                      onChangeBatchSize(opt.value)
                    }}
                    className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                      batchSize === opt.value
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Nghe phát âm chuẩn & chậm 0.6x để nhận diện từ vựng bằng tai
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Mode 5: Cloze Test Mode */}
          <button
            onClick={() => handleStart('cloze')}
            className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                    5. Điền từ vào câu (Cloze Test)
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                    MỚI
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Luyện phản xạ điền từ đúng ngữ cảnh thực tế, tự động phát âm cả câu
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
          Thẻ bạn đánh dấu <strong>Đã thuộc</strong> sẽ tự động ẩn đi. Bất cứ lúc nào muốn ôn lại toàn bộ, chỉ cần bấm nút <strong>Reset</strong>!
        </p>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          data-no-pull="true"
          onClick={() => setShowResetConfirm(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-center"
          >
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
