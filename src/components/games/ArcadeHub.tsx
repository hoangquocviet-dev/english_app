import {
  ChevronRight,
  Crown,
  Crosshair,
  Flame,
  Gamepad2,
  Info,
  RefreshCw,
  Rocket,
  Trophy,
  UserPen,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ArcadeGameId, Deck, GameHighScores, LeaderboardEntry, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { cloudSyncService, computePlayerTag } from '../../utils/cloudSync'

export const ALL_DECKS_ID = '__all__'

interface ArcadeHubProps {
  decks: Deck[]
  selectedDeckId: string
  words: WordItem[]
  allWords: WordItem[]
  highScores: GameHighScores
  onSelectArcadeDeck: (deckId: string) => void
  onStartGame: (gameId: ArcadeGameId) => void
  onOpenCloudSync?: () => void
}

export function ArcadeHub({
  decks,
  selectedDeckId,
  words,
  allWords,
  highScores,
  onSelectArcadeDeck,
  onStartGame,
  onOpenCloudSync,
}: ArcadeHubProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoadingBoard, setIsLoadingBoard] = useState(true)
  const [myTag, setMyTag] = useState('')

  const totalBestScore =
    (highScores['sky-defender'] || 0) +
    (highScores['speed-match'] || 0) +
    (highScores['blitz-2s'] || 0)

  const deckCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const w of allWords) {
      map[w.deckId] = (map[w.deckId] || 0) + 1
    }
    return map
  }, [allWords])

  const loadLeaderboard = useCallback(async () => {
    const [entries, tag] = await Promise.all([
      cloudSyncService.fetchLeaderboard(10),
      computePlayerTag(cloudSyncService.getSyncCode()),
    ])
    setLeaderboard(entries.filter((e) => e.total_score > 0))
    setMyTag(tag)
    setIsLoadingBoard(false)
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([
      cloudSyncService.fetchLeaderboard(10),
      computePlayerTag(cloudSyncService.getSyncCode()),
    ]).then(([entries, tag]) => {
      if (!active) return
      setLeaderboard(entries.filter((e) => e.total_score > 0))
      setMyTag(tag)
      setIsLoadingBoard(false)
    })

    const unsubscribe = cloudSyncService.subscribe(() => {
      const snap = cloudSyncService.getSnapshot()
      if (snap.status === 'synced') {
        void loadLeaderboard()
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [loadLeaderboard])

  const handleLaunch = (gameId: ArcadeGameId) => {
    audioService.playClick()
    onStartGame(gameId)
  }

  const handleRefreshBoard = () => {
    audioService.playClick()
    setIsLoadingBoard(true)
    void loadLeaderboard()
  }

  return (
    <div className="w-full max-w-md mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Header Banner */}
      <div className="rounded-3xl p-4 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 text-white shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shrink-0">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight leading-tight">
                Đấu Trường Từ Vựng
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5 leading-snug">
                Vừa chơi vừa rèn phản xạ tiếng Anh tốc độ cao
              </p>
            </div>
          </div>

          <div className="text-right bg-black/20 backdrop-blur-xs px-3 py-1.5 rounded-2xl border border-white/15 shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-indigo-100 font-semibold">
              Tổng kỷ lục
            </div>
            <div className="text-sm font-extrabold flex items-center justify-end gap-1 text-amber-300">
              <Trophy className="w-3.5 h-3.5" />
              <span>{totalBestScore.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Deck Selector inside Arcade */}
        <div className="mt-3.5 pt-3 border-t border-white/15 relative z-10">
          <label className="text-[11px] font-semibold text-indigo-100 uppercase tracking-wider block mb-1.5">
            Đạn từ vựng sử dụng ({words.length.toLocaleString()} từ)
          </label>
          <div className="relative">
            <select
              value={selectedDeckId}
              onChange={(e) => onSelectArcadeDeck(e.target.value)}
              className="w-full py-2 px-3 pr-9 rounded-xl bg-slate-900/40 hover:bg-slate-900/55 border border-white/20 text-white font-semibold text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <option value={ALL_DECKS_ID} className="text-slate-900 bg-white font-bold">
                Tất cả kho từ vựng ({allWords.length.toLocaleString()} từ)
              </option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id} className="text-slate-900 bg-white">
                  {deck.name} ({deckCounts[deck.id] || 0} từ)
                </option>
              ))}
            </select>
            <ChevronRight className="w-4 h-4 text-white/80 rotate-90 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {selectedDeckId !== ALL_DECKS_ID && words.length < 6 && (
            <p className="mt-2 text-[11px] text-amber-200 flex items-center gap-1.5 leading-snug">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Bộ này có ít từ nên hệ thống sẽ tự mượn thêm từ kho chung khi thi đấu.</span>
            </p>
          )}
        </div>
      </div>

      {/* 3 Arcade Mini-Games */}
      <div className="space-y-3">
        {/* Game 1: Sky Defender */}
        <button
          type="button"
          onClick={() => handleLaunch('sky-defender')}
          className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/60 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
        >
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
              <Rocket className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  1. Không Chiến Từ Vựng
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Crosshair className="w-3 h-3" />
                  Kỷ lục: {(highScores['sky-defender'] || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Chạm chọn làn bay để khai hỏa laser bắn hạ đúng máy bay mang từ khớp với nghĩa mục tiêu.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Game 2: Speed Match 60s */}
        <button
          type="button"
          onClick={() => handleLaunch('speed-match')}
          className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
        >
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Zap className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  2. Ghép Cặp Siêu Tốc 60s
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Kỷ lục: {(highScores['speed-match'] || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Chạm nối nhanh cặp Từ Anh — Nghĩa Việt trong 60 giây. Ghép liên hoàn tích Combo nhận thêm giây thưởng!
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Game 3: 2-Second Blitz */}
        <button
          type="button"
          onClick={() => handleLaunch('blitz-2s')}
          className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-rose-500/60 text-left transition-all flex items-center justify-between group shadow-xs active:scale-98"
        >
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/20">
              <Flame className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                  3. Đúng Hay Sai Trong 2 Giây
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  Kỷ lục: {(highScores['blitz-2s'] || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Phán đoán chớp nhoáng cặp Từ — Nghĩa là thật hay bẫy trước khi thanh thời gian chạm đáy!
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Live Cloud Leaderboard Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                Bảng Phong Thần Toàn Server
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Top 10 cao thủ tổng điểm 3 chế độ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onOpenCloudSync && (
              <button
                type="button"
                onClick={() => {
                  audioService.playClick()
                  onOpenCloudSync()
                }}
                className="py-1.5 px-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <UserPen className="w-3 h-3" />
                <span>Đặt tên</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRefreshBoard}
              aria-label="Làm mới bảng xếp hạng"
              className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBoard ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {isLoadingBoard ? (
          <div className="py-6 text-center text-xs text-slate-400 font-medium">
            Đang tải bảng xếp hạng Cloud...
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Chưa có kỷ lục nào trên bảng xếp hạng!
            </p>
            <p className="text-[11px] text-slate-400">
              Hãy chơi ngay 1 ván để trở thành Quán quân đầu tiên của VocabFlow.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {leaderboard.map((entry, idx) => {
              const rank = idx + 1
              const isMe = Boolean(myTag && entry.player_tag === myTag)
              const rankStyle =
                rank === 1
                  ? 'bg-amber-500 text-white'
                  : rank === 2
                  ? 'bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                  : rank === 3
                  ? 'bg-amber-700/80 text-white'
                  : 'bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400'

              return (
                <div
                  key={entry.player_tag}
                  className={`py-2 px-2.5 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors ${
                    isMe
                      ? 'bg-indigo-500/10 border border-indigo-500/30'
                      : 'bg-slate-50/80 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg text-[11px] font-extrabold flex items-center justify-center shrink-0 ${rankStyle}`}
                    >
                      {rank}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                        <span className="truncate">{entry.nickname}</span>
                        {isMe && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-indigo-600 text-white shrink-0">
                            Bạn
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        KC: {entry.sky_score} • GC: {entry.match_score} • 2s: {entry.blitz_score}
                        {entry.mastered_count > 0 ? ` • Thuộc ${entry.mastered_count} từ` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="font-extrabold text-indigo-600 dark:text-indigo-400 shrink-0 tabular-nums">
                    {entry.total_score.toLocaleString()} đ
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
