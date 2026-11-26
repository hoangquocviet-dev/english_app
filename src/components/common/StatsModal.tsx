import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Flame,
  Lock,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volume2,
  X,
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import type { Deck, GameHighScores, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface StatsModalProps {
  isOpen: boolean
  onClose: () => void
  decks: Deck[]
  allWords: WordItem[]
  streak: number
  highScores: GameHighScores
  onJumpToDeck: (deckId: string) => void
  onStartGlobalWeakReview?: (mode: StudyMode) => void
}

export function StatsModal({
  isOpen,
  onClose,
  decks,
  allWords,
  streak,
  highScores,
  onJumpToDeck,
  onStartGlobalWeakReview,
}: StatsModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const nowMs = storageService.getNowMs()

  const summary = useMemo(() => {
    let mastered = 0
    let learning = 0
    let starred = 0
    let due = 0
    let srsLv3Plus = 0
    const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const deckTotals = new Map<string, { total: number; mastered: number }>()
    const weakPool: WordItem[] = []

    for (const w of allWords) {
      const curDeck = deckTotals.get(w.deckId) || { total: 0, mastered: 0 }
      curDeck.total += 1
      if (w.starred) starred += 1
      if (w.status === 'mastered') {
        mastered += 1
        curDeck.mastered += 1
        const lvl = w.srsLevel && w.srsLevel >= 1 && w.srsLevel <= 5 ? w.srsLevel : 1
        levelCounts[lvl] = (levelCounts[lvl] || 0) + 1
        if (lvl >= 3) srsLv3Plus += 1
        if (!w.nextReview || w.nextReview <= nowMs) due += 1
      } else if (w.status === 'learning') {
        learning += 1
        weakPool.push(w)
      }
      deckTotals.set(w.deckId, curDeck)
    }

    const seenTerms = new Set<string>()
    const topWeakWords = weakPool
      .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || (b.lastReviewed || 0) - (a.lastReviewed || 0))
      .filter((w) => {
        const k = w.term.trim().toLowerCase()
        if (seenTerms.has(k)) return false
        seenTerms.add(k)
        return true
      })
      .slice(0, 5)

    const totalScore =
      (highScores['sky-defender'] || 0) +
      (highScores['speed-match'] || 0) +
      (highScores['blitz-2s'] || 0) +
      (highScores['word-bomb'] || 0)

    const deckRows = decks
      .map((d) => {
        const st = deckTotals.get(d.id) || { total: 0, mastered: 0 }
        const pct = st.total > 0 ? Math.round((st.mastered / st.total) * 100) : 0
        return { deck: d, total: st.total, mastered: st.mastered, pct }
      })
      .sort((a, b) => b.pct - a.pct || b.mastered - a.mastered)

    return {
      mastered,
      learning,
      starred,
      due,
      srsLv3Plus,
      totalScore,
      levelCounts,
      deckRows,
      topWeakWords,
      uniqueWeakCount: seenTerms.size,
      overallPct: allWords.length > 0 ? Math.round((mastered / allWords.length) * 100) : 0,
    }
  }, [allWords, decks, highScores, nowMs])

  if (!isOpen) return null

  const series14 = storageService.getRecentDailySeries(14)
  const dailyGoal = storageService.getDailyProgress().goal || 20
  const max14 = Math.max(dailyGoal, ...series14.map((d) => d.count), 1)
  const totalReviews14 = series14.reduce((acc, d) => acc + d.count, 0)
  const peakDay14 = Math.max(0, ...series14.map((d) => d.count))

  const badges = [
    {
      id: 'first-step',
      title: 'Khởi đầu mới',
      desc: 'Thuộc từ vựng đầu tiên',
      unlocked: summary.mastered >= 1,
      progress: `${Math.min(1, summary.mastered)}/1`,
    },
    {
      id: 'streak-3',
      title: 'Lửa bền bỉ',
      desc: 'Chuỗi học liên tiếp 3 ngày',
      unlocked: streak >= 3,
      progress: `${Math.min(3, streak)}/3d`,
    },
    {
      id: 'scholar-100',
      title: 'Học giả trăm từ',
      desc: 'Thuộc lòng 100 từ vựng',
      unlocked: summary.mastered >= 100,
      progress: `${Math.min(100, summary.mastered)}/100`,
    },
    {
      id: 'srs-pro',
      title: 'Trí nhớ dài hạn',
      desc: '10 thẻ đạt SRS Lv.3+ (≥7 ngày)',
      unlocked: summary.srsLv3Plus >= 10,
      progress: `${Math.min(10, summary.srsLv3Plus)}/10`,
    },
    {
      id: 'arcade-ace',
      title: 'Xạ thủ Đấu Trường',
      desc: 'Tổng kỷ lục đạt 1,500+ điểm',
      unlocked: summary.totalScore >= 1500,
      progress: `${Math.min(1500, summary.totalScore)}/1500`,
    },
    {
      id: 'master-500',
      title: 'Bậc thầy 500 từ',
      desc: 'Chinh phục 500+ từ tiếng Anh',
      unlocked: summary.mastered >= 500,
      progress: `${Math.min(500, summary.mastered)}/500`,
    },
  ]

  const unlockedCount = badges.filter((b) => b.unlocked).length

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-no-pull="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/65 backdrop-blur-xs animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md sm:max-w-lg max-h-[90dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                Hồ sơ & Thành tựu Học tập
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Tổng quan trí nhớ dài hạn & tiến độ toàn kho ({allWords.length.toLocaleString()} từ)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng thống kê"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Hero KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>Chuỗi học</span>
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              {streak} ngày
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã thuộc</span>
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              {summary.mastered}{' '}
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                ({summary.overallPct}%)
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20">
            <div className="flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Đã lưu sao</span>
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
              {summary.starred} từ
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              <Trophy className="w-3.5 h-3.5" />
              <span>Đấu Trường</span>
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {summary.totalScore.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 14-Day Activity Chart */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Nhịp độ 14 ngày gần nhất
            </span>
            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              Tổng {totalReviews14} lượt • Đỉnh {peakDay14}/ngày
            </span>
          </div>

          <div className="flex items-end gap-1 h-14 pt-1">
            {series14.map((day) => {
              const hPct =
                day.count > 0 ? Math.max(18, Math.round((day.count / max14) * 100)) : 8
              const metGoal = day.count >= dailyGoal
              return (
                <div
                  key={day.dateKey}
                  title={`${day.dateKey}: ${day.count} lượt`}
                  className="flex-1 h-full rounded-md bg-slate-200/70 dark:bg-slate-900/80 flex items-end p-0.5 overflow-hidden"
                >
                  <div
                    style={{ height: `${hPct}%` }}
                    className={`w-full rounded-2xs transition-all ${
                      day.count === 0
                        ? 'bg-slate-300/60 dark:bg-slate-800'
                        : metGoal
                        ? 'bg-emerald-500'
                        : day.isToday
                        ? 'bg-indigo-500'
                        : 'bg-indigo-400/75 dark:bg-indigo-500/65'
                    }`}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span>13 ngày trước</span>
            <span>Hôm nay ({series14[series14.length - 1]?.count || 0} lượt)</span>
          </div>
        </div>

        {/* Unlockable Achievement Badges */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Huy hiệu Thành tựu</span>
            </span>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
              Đã mở {unlockedCount}/{badges.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {badges.map((b) => (
              <div
                key={b.id}
                className={`p-2.5 rounded-2xl border flex items-start gap-2 transition-colors ${
                  b.unlocked
                    ? 'bg-amber-500/10 border-amber-500/30 text-slate-900 dark:text-slate-100'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800 opacity-65'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    b.unlocked
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                  }`}
                >
                  {b.unlocked ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate">{b.title}</span>
                    <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 shrink-0">
                      {b.unlocked ? '✓' : b.progress}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Weak / Leech Words Spotlight (Visible when learner has unmastered mistakes) */}
        {summary.topWeakWords.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-rose-500/8 dark:bg-rose-500/10 border border-rose-500/25 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Từ hay nhầm cần củng cố ({summary.uniqueWeakCount})</span>
              </span>
              {onStartGlobalWeakReview && (
                <button
                  type="button"
                  onClick={() => {
                    audioService.playClick()
                    onStartGlobalWeakReview('flashcard')
                  }}
                  className="py-1 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  <Target className="w-3 h-3" />
                  <span>Ôn gộp ngay</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {summary.topWeakWords.map((w) => (
                <div
                  key={w.id}
                  className="p-2 px-2.5 rounded-xl bg-white/90 dark:bg-slate-900/75 border border-rose-500/15 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                        {w.term}
                      </span>
                      {w.ipa && (
                        <span className="text-[10px] font-mono text-slate-400">{w.ipa}</span>
                      )}
                      {w.reviewCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          Nhầm {w.reviewCount}×
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {w.definition}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void audioService.speak(w.term)}
                    aria-label={`Nghe phát âm ${w.term}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-Deck Mastery Progress */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>Tiến độ theo từng bộ chủ đề</span>
          </span>

          <div className="max-h-44 overflow-y-auto space-y-2 pr-0.5">
            {summary.deckRows.map((row) => (
              <button
                key={row.deck.id}
                type="button"
                onClick={() => {
                  audioService.playClick()
                  onJumpToDeck(row.deck.id)
                  onClose()
                }}
                className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-500/8 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-left transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                    {row.deck.name}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {row.mastered}/{row.total} ({row.pct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden">
                  <div
                    style={{ width: `${row.pct}%` }}
                    className="h-full rounded-full bg-emerald-500 transition-all"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Keyboard Shortcuts Cheat-Sheet (Hidden on mobile so 360px stays ultra-compact) */}
        <div className="hidden sm:block pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
            Phím tắt nhanh trên máy tính (Nhấn ? để mở nhanh)
          </span>
          <div className="grid grid-cols-3 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Đổi Tab</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">Alt+1–4</kbd>
            </div>
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Lật / Nghe</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">Space</kbd>
            </div>
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Chọn đáp án</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">1 – 4</kbd>
            </div>
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Tự chạy / Mic</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">A / M</kbd>
            </div>
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Đánh dấu sao</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">S</kbd>
            </div>
            <div className="p-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Hoàn tác thẻ</span>
              <kbd className="font-mono font-bold text-indigo-600 dark:text-indigo-400">Ctrl+Z</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatsModal
