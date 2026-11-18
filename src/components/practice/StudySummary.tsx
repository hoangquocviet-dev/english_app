import confetti from 'canvas-confetti'
import { CheckCircle2, RotateCcw, Target, Trophy } from 'lucide-react'
import { useEffect } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'

interface StudySummaryProps {
  stats: StudySessionStats
  onContinueRemaining?: (remainingWords: WordItem[]) => void
  onResetDeck: () => void
  onBackToHome: () => void
}

export function StudySummary({
  stats,
  onContinueRemaining,
  onResetDeck,
  onBackToHome,
}: StudySummaryProps) {
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

  const totalAttempts = stats.masteredCount + stats.reviewCount
  const percent =
    totalAttempts > 0 ? Math.round((stats.masteredCount / totalAttempts) * 100) : 100
  const remainingWords = stats.remainingWords || []
  const isAllDeckMastered = remainingWords.length === 0

  return (
    <div className="w-full flex flex-col items-center justify-center p-5 text-center max-w-sm mx-auto my-auto animate-fadeIn">
      {/* Trophy Badge */}
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-500 shadow-lg">
        <Trophy className="w-10 h-10" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        {isAllDeckMastered ? 'Đã thuộc trọn bộ từ!' : 'Hoàn thành lượt học!'}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Bộ từ: <span className="font-semibold text-slate-700 dark:text-slate-300">{stats.deckName}</span>
      </p>

      {isAllDeckMastered && (
        <div className="w-full px-3.5 py-2.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-medium leading-relaxed">
          Toàn bộ các thẻ đã thuộc được ẩn đi để bạn không phải học lại. Khi nào muốn ôn lại từ đầu, hãy bấm nút <strong>Reset bộ từ</strong>.
        </div>
      )}

      {/* Stats Card */}
      <div className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Độ chính xác phản xạ</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">{percent}%</span>
        </div>

        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <div className="text-2xl font-bold">{stats.masteredCount}</div>
            <div className="text-xs font-medium">Đã thuộc (Đã ẩn)</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <div className="text-2xl font-bold">{remainingWords.length}</div>
            <div className="text-xs font-medium">Thẻ còn lại</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-2.5">
        {remainingWords.length > 0 && onContinueRemaining && (
          <button
            onClick={() => onContinueRemaining(remainingWords)}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
          >
            <Target className="w-4 h-4" />
            <span>Học tiếp {remainingWords.length} thẻ chưa thuộc</span>
          </button>
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

        <button
          onClick={onResetDeck}
          className="w-full py-3 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-semibold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset bộ từ để hiện lại toàn bộ thẻ</span>
        </button>
      </div>
    </div>
  )
}
