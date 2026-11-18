import confetti from 'canvas-confetti'
import { CheckCircle2, RotateCcw, Target, Trophy } from 'lucide-react'
import { useEffect } from 'react'
import type { StudySessionStats, WordItem } from '../../types'
import { audioService } from '../../utils/audio'

interface StudySummaryProps {
  stats: StudySessionStats
  onRestart: () => void
  onPracticeMissed?: (missedWords: WordItem[]) => void
  onBackToHome: () => void
}

export function StudySummary({
  stats,
  onRestart,
  onPracticeMissed,
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
  const missedWords = stats.missedWords || []

  return (
    <div className="w-full flex flex-col items-center justify-center p-5 text-center max-w-sm mx-auto my-auto animate-fadeIn">
      {/* Trophy Badge */}
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-500 shadow-lg">
        <Trophy className="w-10 h-10" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        Hoàn thành phiên học!
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
        Bộ từ: <span className="font-semibold text-slate-700 dark:text-slate-300">{stats.deckName}</span>
      </p>

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
            <div className="text-xs font-medium">Lượt nhớ chuẩn</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <div className="text-2xl font-bold">{stats.reviewCount}</div>
            <div className="text-xs font-medium">Lượt cần ôn</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full space-y-2.5">
        {missedWords.length > 0 && onPracticeMissed && (
          <button
            onClick={() => onPracticeMissed(missedWords)}
            className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
          >
            <Target className="w-4 h-4" />
            <span>Ôn ngay {missedWords.length} từ chưa vững</span>
          </button>
        )}

        <button
          onClick={onRestart}
          className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Luyện tập lại toàn bộ</span>
        </button>

        <button
          onClick={onBackToHome}
          className="w-full py-3.5 px-4 rounded-xl bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Về trang chủ chọn chế độ khác</span>
        </button>
      </div>
    </div>
  )
}
