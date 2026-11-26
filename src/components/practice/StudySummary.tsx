import confetti from 'canvas-confetti'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volume2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { StudyMode, StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { useChildModalBack } from '../../utils/useChildModalBack'
import { SheetGrabber } from '../common/SheetGrabber'

interface StudySummaryProps {
  stats: StudySessionStats
  sessionWords?: WordItem[]
  onContinueRemaining?: (remainingWords: WordItem[]) => void
  onSwitchMode?: (nextMode: StudyMode, targetWords: WordItem[]) => void
  onResetDeck?: () => void
  onBackToHome: () => void
}

const MODE_LABELS: Array<{ mode: StudyMode; label: string }> = [
  { mode: 'smart-mix', label: 'Tổng hợp ⚡' },
  { mode: 'flashcard', label: 'Flashcard' },
  { mode: 'quiz', label: 'Trắc nghiệm' },
  { mode: 'spelling', label: 'Ghép chữ' },
  { mode: 'listening', label: 'Luyện nghe' },
  { mode: 'cloze', label: 'Điền câu' },
]

export function StudySummary({
  stats,
  sessionWords,
  onContinueRemaining,
  onSwitchMode,
  onResetDeck,
  onBackToHome,
}: StudySummaryProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showRemainingList, setShowRemainingList] = useState(false)

  useChildModalBack(showResetConfirm, () => setShowResetConfirm(false))
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    const combined = [...(stats.remainingWords || []), ...(sessionWords || [])]
    const liveIds = new Set(
      storageService
        .getWords()
        .filter((w) => w.starred)
        .map((w) => w.id)
    )
    for (const w of combined) {
      if (w.starred) liveIds.add(w.id)
    }
    return liveIds
  })

  const remainingWords = useMemo(() => stats.remainingWords || [], [stats.remainingWords])
  const reviewableList = useMemo(
    () => (remainingWords.length > 0 ? remainingWords : sessionWords || []),
    [remainingWords, sessionWords]
  )
  const batchSize = storageService.getStudyPreferences().batchSize
  const nextBatchCount =
    batchSize > 0 && remainingWords.length > batchSize ? batchSize : remainingWords.length
  const isAllDeckMastered = remainingWords.length === 0
  const totalAttempts = stats.masteredCount + stats.reviewCount
  const percent =
    totalAttempts > 0 ? Math.round((stats.masteredCount / totalAttempts) * 100) : 100

  useEffect(() => {
    audioService.playSuccessChime()
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#38bdf8', '#22c55e', '#f59e0b'],
      })
    } catch {}

    return () => {
      try {
        confetti.reset()
      } catch {}
    }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showResetConfirm) {
        if (e.key === 'Escape') {
          setShowResetConfirm(false)
        }
        return
      }

      if (e.key === 'Escape') {
        onBackToHome()
      } else if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        if (remainingWords.length > 0 && onContinueRemaining) {
          onContinueRemaining(remainingWords)
        } else {
          onBackToHome()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showResetConfirm, remainingWords, onContinueRemaining, onBackToHome])

  const handleConfirmReset = () => {
    audioService.playClick()
    setShowResetConfirm(false)
    onResetDeck?.()
  }

  return (
    <div className="w-full flex flex-col items-center justify-center p-4 sm:p-5 text-center max-w-sm mx-auto my-auto animate-fadeIn relative">
      {/* Trophy Badge */}
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-500 shadow-lg">
        <Trophy className="w-10 h-10" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        {isAllDeckMastered
          ? onResetDeck
            ? 'Đã thuộc trọn bộ từ!'
            : 'Hoàn tất ôn tập SRS!'
          : 'Hoàn thành lượt học!'}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Bộ từ: <span className="font-semibold text-slate-700 dark:text-slate-300">{stats.deckName}</span>
      </p>

      {isAllDeckMastered && (
        <div className="w-full px-3.5 py-2.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-medium leading-relaxed">
          {onResetDeck ? (
            <>
              Toàn bộ các thẻ đã thuộc được ẩn đi để bạn không phải học lại. Khi nào muốn ôn lại từ đầu, hãy bấm nút <strong>Reset bộ từ</strong>.
            </>
          ) : (
            <>
              Tuyệt vời! Toàn bộ thẻ đến hạn SRS đã được nâng lên chu kỳ ghi nhớ dài hạn tiếp theo.
            </>
          )}
        </div>
      )}

      {/* Stats Card */}
      <div className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 mb-4 space-y-4 shadow-xs">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Độ chính xác phản xạ</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{percent}%</span>
        </div>

        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-500 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <div className="text-2xl font-bold">{stats.masteredCount}</div>
            <div className="text-xs font-medium">Đã thuộc (Đã ẩn)</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <div className="text-2xl font-bold">{remainingWords.length}</div>
            <div className="text-xs font-medium">Thẻ còn lại</div>
          </div>
        </div>

        {/* Expandable Remaining / Conquered Words Accordion */}
        {reviewableList.length > 0 && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                audioService.playClick()
                setShowRemainingList((prev) => !prev)
              }}
              className="w-full min-h-9 py-2 px-2.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1.5 transition-colors active:scale-98"
            >
              <span>
                {showRemainingList
                  ? 'Thu gọn danh sách'
                  : remainingWords.length > 0
                  ? `Xem ${remainingWords.length} từ cần ôn lại`
                  : `Xem lại ${reviewableList.length} từ vừa chinh phục`}
              </span>
              {showRemainingList ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showRemainingList && (
              <div className="mt-2.5 max-h-52 overflow-y-auto space-y-1.5 pr-1 text-left animate-fadeIn">
                {reviewableList.map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => void audioService.speak(w.term)}
                      className="min-w-0 flex-1 text-left active:opacity-75 transition-opacity"
                      title="Chạm để nghe phát âm"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {w.term}
                        </span>
                        {w.ipa && (
                          <span className="text-[10px] text-slate-400 font-mono">{w.ipa}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {w.definition}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const next = storageService.toggleWordStar(w.id)
                          audioService.playClick()
                          setStarredIds((prev) => {
                            const copy = new Set(prev)
                            if (next) copy.add(w.id)
                            else copy.delete(w.id)
                            return copy
                          })
                        }}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95 ${
                          starredIds.has(w.id)
                            ? 'bg-amber-500/12 text-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-amber-500'
                        }`}
                        title="Đánh dấu sao từ cần ôn"
                      >
                        <Star
                          className={`w-4 h-4 ${starredIds.has(w.id) ? 'fill-amber-400' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => void audioService.speak(w.term)}
                        className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 active:scale-95 transition-colors"
                        title="Nghe phát âm"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-2.5">
        {remainingWords.length > 0 && onContinueRemaining && (
          <button
            onClick={() => onContinueRemaining(remainingWords)}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
          >
            <Target className="w-4 h-4" />
            <span>
              {nextBatchCount < remainingWords.length
                ? `Học tiếp lượt kế (${nextBatchCount} / ${remainingWords.length} thẻ)`
                : `Học tiếp ${remainingWords.length} thẻ chưa thuộc`}
            </span>
          </button>
        )}

        {/* 1-Tap Cross-Mode Drill Switcher (40px thumb-friendly buttons!) */}
        {onSwitchMode &&
          (remainingWords.length > 0 || (sessionWords && sessionWords.length > 0)) && (
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 space-y-2 text-left">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>
                  {remainingWords.length > 0
                    ? nextBatchCount < remainingWords.length
                      ? `Đổi chế độ ôn lượt kế (${nextBatchCount}/${remainingWords.length} thẻ):`
                      : `Đổi chế độ ôn ${remainingWords.length} thẻ chưa thuộc:`
                    : `Luyện sâu lại ${sessionWords?.length || stats.totalWords} thẻ vừa học qua:`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {MODE_LABELS.filter((m) => m.mode !== stats.mode).map((item) => {
                  const targetPool =
                    remainingWords.length > 0 ? remainingWords : sessionWords || []
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => {
                        audioService.playClick()
                        onSwitchMode(item.mode, targetPool)
                      }}
                      className="min-h-10 py-2 px-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 dark:hover:text-white border border-indigo-500/20 text-xs font-bold flex items-center justify-center whitespace-nowrap transition-colors active:scale-95"
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        <button
          onClick={onBackToHome}
          className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 ${
            isAllDeckMastered
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
              : 'bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Về trang chủ</span>
        </button>

        {onResetDeck && (
          <button
            onClick={() => {
              audioService.playClick()
              setShowResetConfirm(true)
            }}
            className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset bộ từ để hiện lại toàn bộ thẻ</span>
          </button>
        )}
      </div>

      {/* Safety Confirmation Modal for Reset Deck (Mobile Bottom-Sheet) */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          data-no-pull="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:max-w-xs w-full space-y-4 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <SheetGrabber onDismiss={() => setShowResetConfirm(false)} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-500">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Reset tiến độ bộ từ?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                aria-label="Đóng xác nhận đặt lại"
                className="w-9 h-9 -mr-1.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Bạn có chắc chắn muốn đặt lại bộ từ <strong>"{stats.deckName}"</strong> không? Toàn bộ các thẻ đã thuộc sẽ được chuyển về trạng thái cần ôn để bạn bắt đầu lại từ đầu.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 min-h-11 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-transform active:scale-98"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="flex-1 min-h-11 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-transform active:scale-98 shadow-xs"
              >
                Xác nhận đặt lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
