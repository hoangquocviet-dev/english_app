import {
  AlertCircle,
  Check,
  Cloud,
  Copy,
  DownloadCloud,
  KeyRound,
  Link2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { audioService } from '../../utils/audio'
import { cloudSyncService, type SyncStateSnapshot } from '../../utils/cloudSync'

interface CloudSyncModalProps {
  isOpen: boolean
  onClose: () => void
  onDataRestored: () => void
}

function formatSyncTime(ts: number | null): string {
  if (!ts) return 'Chưa đồng bộ lần nào'
  try {
    const d = new Date(ts)
    return `Đã lưu lúc ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return 'Đã đồng bộ'
  }
}

export function CloudSyncModal({ isOpen, onClose, onDataRestored }: CloudSyncModalProps) {
  const [activeTab, setActiveTab] = useState<'my-id' | 'restore'>('my-id')
  const [snapshot, setSnapshot] = useState<SyncStateSnapshot>(() => cloudSyncService.getSnapshot())
  const [nicknameInput, setNicknameInput] = useState(() => cloudSyncService.getNickname())
  const [nicknameSaved, setNicknameSaved] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  // Restore tab state
  const [restoreInput, setRestoreInput] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreFeedback, setRestoreFeedback] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    return cloudSyncService.subscribe(() => {
      setSnapshot(cloudSyncService.getSnapshot())
    })
  }, [])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    let active = true
    const magicUrl = `${window.location.origin}/?sync=${encodeURIComponent(snapshot.syncCode)}`
    void QRCode.toDataURL(magicUrl, {
      width: 176,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isOpen, snapshot.syncCode])

  if (!isOpen) return null

  const handleCopyCode = async () => {
    audioService.playClick()
    try {
      await navigator.clipboard.writeText(snapshot.syncCode)
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 2000)
    } catch {}
  }

  const handleCopyMagicLink = async () => {
    audioService.playClick()
    if (typeof window === 'undefined') return
    const magicUrl = `${window.location.origin}/?sync=${encodeURIComponent(snapshot.syncCode)}`
    try {
      await navigator.clipboard.writeText(magicUrl)
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 2200)
    } catch {}
  }

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault()
    audioService.playClick()
    cloudSyncService.setNickname(nicknameInput)
    setNicknameSaved(true)
    window.setTimeout(() => setNicknameSaved(false), 2000)
    await cloudSyncService.pushNow(true)
  }

  const handleManualPush = async () => {
    audioService.playClick()
    setSyncNotice(null)
    const ok = await cloudSyncService.pushNow(true)
    if (ok) {
      audioService.playSuccessChime()
      setSyncNotice('Đã sao lưu toàn bộ tiến độ học & kỷ lục lên Cloud!')
    } else {
      setSyncNotice('Không thể kết nối Cloud lúc này. Vui lòng kiểm tra mạng.')
    }
  }

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restoreInput.trim() || isRestoring) return
    audioService.playClick()
    setIsRestoring(true)
    setRestoreFeedback(null)

    const outcome = await cloudSyncService.restoreFromCode(restoreInput)
    setIsRestoring(false)
    setRestoreFeedback({ ok: outcome.ok, message: outcome.message })

    if (outcome.ok) {
      audioService.playSuccessChime()
      setNicknameInput(cloudSyncService.getNickname())
      setRestoreInput('')
      onDataRestored()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/65 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                Đồng bộ Đám mây & Mã ID
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Học xuyên suốt mọi thiết bị, không cần tạo tài khoản
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại đồng bộ"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setActiveTab('my-id')
              setRestoreFeedback(null)
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'my-id'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Mã ID của tôi</span>
          </button>
          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setActiveTab('restore')
              setSyncNotice(null)
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'restore'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>Nhập ID máy cũ</span>
          </button>
        </div>

        {activeTab === 'my-id' ? (
          <div className="space-y-4">
            {/* Sync ID Hero Card */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white shadow-md space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="uppercase tracking-wider font-bold text-indigo-200">
                  Mã khôi phục cá nhân
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-emerald-200 font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{formatSyncTime(snapshot.lastSyncedAt)}</span>
                </span>
              </div>

              <div className="py-2.5 px-3 rounded-xl bg-black/25 border border-white/15 text-center">
                <div
                  data-testid="current-sync-code"
                  className="font-mono text-xl sm:text-2xl font-extrabold tracking-widest text-amber-300 select-all"
                >
                  {snapshot.syncCode}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="py-2 px-3 rounded-xl bg-white text-slate-900 hover:bg-indigo-50 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Đã chép Mã!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Sao chép Mã ID</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyMagicLink}
                  className="py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Đã chép Link!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Link chuyển máy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Instant QR Transfer Row */}
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="w-24 h-24 rounded-xl bg-white p-1.5 border border-slate-200 shrink-0 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`Mã QR đồng bộ ${snapshot.syncCode}`}
                    className="w-full h-full object-contain rounded-md"
                  />
                ) : (
                  <QrCode className="w-8 h-8 text-slate-400 animate-pulse" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Quét QR sang điện thoại mới</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Mở camera máy mới quét mã này để tự động mang toàn bộ từ đã thuộc, chuỗi ngày học và điểm kỷ lục sang ngay lập tức.
                </p>
              </div>
            </div>

            {/* Nickname Form */}
            <form onSubmit={handleSaveNickname} className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Biệt danh trên Bảng xếp hạng & Cộng đồng</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={32}
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder={`Mặc định: Chiến binh ${snapshot.syncCode.slice(-4)}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="py-2 px-3.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shrink-0 active:scale-95 transition-transform"
                >
                  {nicknameSaved ? 'Đã lưu!' : 'Lưu tên'}
                </button>
              </div>
            </form>

            {syncNotice && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  snapshot.status === 'error'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {snapshot.status === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 shrink-0" />
                )}
                <span>{syncNotice}</span>
              </div>
            )}

            {/* Manual Force Push Button */}
            <button
              type="button"
              disabled={snapshot.status === 'syncing'}
              onClick={handleManualPush}
              className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
            >
              <RefreshCw
                className={`w-4 h-4 ${snapshot.status === 'syncing' ? 'animate-spin' : ''}`}
              />
              <span>
                {snapshot.status === 'syncing'
                  ? 'Đang đồng bộ lên Cloud...'
                  : 'Đồng bộ lên Cloud ngay'}
              </span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleRestoreSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1.5">
              <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                Khôi phục dữ liệu từ thiết bị khác
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Nhập mã ID <span className="font-mono font-bold">VF-XXXX-XXXX</span> đang hiển thị trên máy cũ của bạn. Toàn bộ từ đã thuộc, bộ từ tự tạo, chuỗi ngày học và kỷ lục game sẽ được tải về máy này.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Nhập Mã ID máy cũ *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value.toUpperCase())}
                placeholder="VD: VF-8K3M-9P2X"
                className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base font-extrabold tracking-widest text-center uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-400 text-center">
                Có thể nhập liền không cần dấu gạch ngang (ví dụ: VF8K3M9P2X)
              </p>
            </div>

            {restoreFeedback && (
              <div
                className={`p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 leading-relaxed ${
                  restoreFeedback.ok
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                }`}
              >
                {restoreFeedback.ok ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{restoreFeedback.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isRestoring || !restoreInput.trim()}
              className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
            >
              <DownloadCloud className={`w-4 h-4 ${isRestoring ? 'animate-bounce' : ''}`} />
              <span>{isRestoring ? 'Đang tải dữ liệu từ Cloud...' : 'Khôi phục dữ liệu ngay'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
export default CloudSyncModal
