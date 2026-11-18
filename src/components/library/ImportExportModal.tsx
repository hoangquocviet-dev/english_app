import { AlertCircle, Check, Copy, Download, FileText, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Deck, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { exportDailyEnglish, parseDailyEnglish } from '../../utils/parser'
import { storageService } from '../../utils/storage'

interface ImportExportModalProps {
  isOpen: boolean
  onClose: () => void
  activeDeck: Deck
  decks: Deck[]
  words: WordItem[]
  onSelectDeck: (deckId: string) => void
  onDataChanged: () => void
}

export function ImportExportModal({
  isOpen,
  onClose,
  activeDeck,
  decks,
  words,
  onSelectDeck,
  onDataChanged,
}: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [importText, setImportText] = useState('')
  const [rawTargetDeckId, setTargetDeckId] = useState(activeDeck.id)
  const [newDeckName, setNewDeckName] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<{ added: number; skipped: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const targetDeckId =
    rawTargetDeckId === 'new' || decks.some((d) => d.id === rawTargetDeckId)
      ? rawTargetDeckId
      : activeDeck.id

  if (!isOpen) return null

  const exportedText = exportDailyEnglish(words)

  const handleCopy = async () => {
    setErrorBanner(null)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(exportedText)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = exportedText
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setIsCopied(true)
      audioService.playClick()
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      setErrorBanner('Không thể sao chép tự động. Vui lòng bôi đen văn bản bên trên để copy.')
    }
  }

  const handleDownload = () => {
    audioService.playClick()
    const cleanFileName = `${activeDeck.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_')}.md`
    const blob = new Blob([exportedText], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = cleanFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    if (!importText.trim()) return

    audioService.playClick()
    setErrorBanner(null)
    const result = parseDailyEnglish(importText)

    if (result.words.length === 0) {
      setImportReport(null)
      setErrorBanner(
        'Chưa tìm thấy dòng nào đúng định dạng (Từ [/IPA/]: Nghĩa) trong đoạn văn bản bạn dán.'
      )
      return
    }

    let finalDeckId = targetDeckId

    if (targetDeckId === 'new') {
      const deckTitle = newDeckName.trim() || `Bộ từ nhập ${new Date().toLocaleDateString('vi-VN')}`
      const createdDeck = storageService.createDeck(deckTitle, 'Nhập từ file Markdown daily-english')
      finalDeckId = createdDeck.id
    }

    const { added, skipped } = storageService.importWords(finalDeckId, result.words)

    setImportReport({ added, skipped })
    setImportText('')
    setNewDeckName('')
    setTargetDeckId(finalDeckId)
    onSelectDeck(finalDeckId)
    audioService.playSuccessChime()
    onDataChanged()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-no-pull="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/60 backdrop-blur-xs animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Nhập / Xuất file Markdown
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại nhập xuất file"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1.5 mx-5 mt-4 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export')
              setImportReport(null)
              setErrorBanner(null)
            }}
            className={`py-2 rounded-lg transition-all ${
              activeTab === 'export'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Xuất file Markdown
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('import')
              setImportReport(null)
              setErrorBanner(null)
            }}
            className={`py-2 rounded-lg transition-all ${
              activeTab === 'import'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Nhập nhanh (Dán text)
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {errorBanner && (
            <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorBanner}</span>
            </div>
          )}

          {activeTab === 'export' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Định dạng xuất chuẩn <code className="text-indigo-500 font-mono">Word [/IPA/]: Nghĩa</code> tương thích 100% để lưu trữ cá nhân hoặc chia sẻ file <code className="text-slate-700 dark:text-slate-300 font-mono">.md</code>.
              </p>

              <textarea
                readOnly
                value={exportedText}
                rows={8}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed resize-none focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs whitespace-nowrap flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                >
                  {isCopied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                  <span>{isCopied ? 'Đã sao chép!' : 'Sao chép'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs whitespace-nowrap flex items-center justify-center gap-1.5 transition-transform active:scale-95 border border-slate-200 dark:border-slate-700"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Tải file .md</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Dán danh sách từ vựng theo mẫu <code className="text-indigo-500 font-mono">Từ: Nghĩa</code> vào ô dưới đây. Hệ thống tự động tách từ, phiên âm và nghĩa.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Đích lưu trữ
                </label>
                <select
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-medium focus:outline-none"
                >
                  <option value="new">+ Tạo bộ từ vựng mới...</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      Nạp vào: {deck.name}
                    </option>
                  ))}
                </select>
              </div>

              {targetDeckId === 'new' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Tên bộ từ mới
                  </label>
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Ví dụ: Từ vựng IELTS chủ đề Môi trường..."
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-medium focus:outline-none"
                  />
                </div>
              )}

              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value)
                  if (errorBanner) setErrorBanner(null)
                }}
                rows={6}
                placeholder={`resilient /rɪˈzɪl.i.ənt/: Kiên cường, bền bỉ\nbreakthrough: Bước đột phá`}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed resize-none focus:outline-none"
              />

              {importReport && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span>
                    Nạp thành công <strong>{importReport.added}</strong> từ vựng mới!
                  </span>
                  {importReport.skipped > 0 && (
                    <span className="text-slate-400">(Bỏ qua {importReport.skipped} từ trùng)</span>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={!importText.trim()}
                onClick={handleImport}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Bắt đầu phân tích & Nạp từ</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
