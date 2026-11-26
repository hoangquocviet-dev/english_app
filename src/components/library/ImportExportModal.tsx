import { AlertCircle, Check, Copy, Download, FileText, FolderOpen, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Deck, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import {
  type ExportFormat,
  exportDailyEnglish,
  exportVocabCsv,
  exportVocabJson,
  parseDailyEnglish,
} from '../../utils/parser'
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>('md')
  const [importText, setImportText] = useState('')
  const [rawTargetDeckId, setTargetDeckId] = useState(activeDeck.id)
  const [newDeckName, setNewDeckName] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<{
    added: number
    skipped: number
    format?: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const livePreview = useMemo(() => {
    if (!isOpen || activeTab !== 'import' || !importText.trim()) return null
    return parseDailyEnglish(importText)
  }, [isOpen, activeTab, importText])

  const targetDeckId =
    rawTargetDeckId === 'new' || decks.some((d) => d.id === rawTargetDeckId)
      ? rawTargetDeckId
      : activeDeck.id

  if (!isOpen) return null

  const exportedText =
    exportFormat === 'csv'
      ? exportVocabCsv(words)
      : exportFormat === 'json'
      ? exportVocabJson(words)
      : exportDailyEnglish(words)

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
    const baseName = activeDeck.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_')
    const ext = exportFormat
    const mime =
      exportFormat === 'csv'
        ? 'text/csv;charset=utf-8'
        : exportFormat === 'json'
        ? 'application/json;charset=utf-8'
        : 'text/markdown;charset=utf-8'
    // Prepend UTF-8 BOM on CSV so Excel on Windows renders Vietnamese accents cleanly
    const content = exportFormat === 'csv' ? `\uFEFF${exportedText}` : exportedText
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrorBanner(null)
    setImportReport(null)

    try {
      const content = await file.text()
      setImportText(content)
      if (targetDeckId === 'new' && !newDeckName.trim()) {
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
        if (cleanTitle) setNewDeckName(cleanTitle)
      }
      audioService.playClick()
    } catch {
      setErrorBanner('Không thể đọc file này. Vui lòng chọn file văn bản (.md, .csv, .tsv, .json, .txt).')
    }
  }

  const handleImport = () => {
    if (!importText.trim()) return

    audioService.playClick()
    setErrorBanner(null)
    const result = parseDailyEnglish(importText)

    if (result.words.length === 0) {
      setImportReport(null)
      setErrorBanner(
        'Chưa nhận diện được từ vựng hợp lệ. Hỗ trợ: Markdown (Từ: Nghĩa), CSV (term,definition), TSV (Quizlet/Excel) hoặc JSON.'
      )
      return
    }

    let finalDeckId = targetDeckId

    if (targetDeckId === 'new') {
      const deckTitle = newDeckName.trim() || `Bộ từ nhập ${new Date().toLocaleDateString('vi-VN')}`
      const createdDeck = storageService.createDeck(deckTitle, 'Bộ từ vựng nhập từ file / văn bản')
      finalDeckId = createdDeck.id
    }

    const { added, skipped } = storageService.importWords(finalDeckId, result.words)

    const formatLabel =
      result.detectedFormat === 'json'
        ? 'JSON'
        : result.detectedFormat === 'csv'
        ? 'CSV'
        : result.detectedFormat === 'tsv'
        ? 'TSV'
        : 'Markdown'

    setImportReport({ added, skipped, format: formatLabel })
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
              Nhập / Xuất bộ từ (MD • CSV • JSON)
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
            Xuất dữ liệu ({words.length} từ)
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
            Nhập từ (File / Dán)
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
            <div className="space-y-3.5">
              {/* Export Format Selector */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Định dạng xuất:
                </span>
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
                  {(
                    [
                      { id: 'md', label: 'Markdown (.md)' },
                      { id: 'csv', label: 'Excel (.csv)' },
                      { id: 'json', label: 'JSON' },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => {
                        audioService.playClick()
                        setExportFormat(fmt.id)
                      }}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        exportFormat === fmt.id
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

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
                  {isCopied ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isCopied ? 'Đã sao chép!' : 'Sao chép'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs whitespace-nowrap flex items-center justify-center gap-1.5 transition-transform active:scale-95 border border-slate-200 dark:border-slate-700"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Tải file .{exportFormat}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Tự nhận diện <code className="text-indigo-500 font-mono">Từ: Nghĩa</code>, bảng{' '}
                  <code className="text-indigo-500 font-mono">CSV/Excel</code>, Quizlet hoặc{' '}
                  <code className="text-indigo-500 font-mono">JSON</code>.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.csv,.tsv,.json,.txt"
                  onChange={(e) => void handlePickFile(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 px-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Chọn file</span>
                </button>
              </div>

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
                placeholder={`resilient /rɪˈzɪl.i.ənt/: Kiên cường, bền bỉ\n- breakthrough: Bước đột phá\nhoặc dán từ Excel / Quizlet / CSV...`}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed resize-none focus:outline-none"
              />

              {livePreview && livePreview.words.length > 0 && (
                <div className="p-2.5 px-3 rounded-xl bg-indigo-500/8 dark:bg-indigo-500/12 border border-indigo-500/20 space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Nhận diện {livePreview.words.length} thẻ hợp lệ</span>
                    </span>
                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/15">
                      {livePreview.detectedFormat || 'markdown'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {livePreview.words.slice(0, 4).map((pw, idx) => (
                      <span
                        key={`${pw.term}-${idx}`}
                        className="text-[10.5px] font-semibold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        {pw.term}
                        {pw.partOfSpeech ? (
                          <span className="text-indigo-500 ml-1">• {pw.partOfSpeech}</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {importReport && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
                  <span>
                    Nạp thành công <strong>{importReport.added}</strong> từ mới
                    {importReport.format ? ` (${importReport.format})` : ''}!
                  </span>
                  {importReport.skipped > 0 && (
                    <span className="text-slate-400 shrink-0">
                      (Bỏ qua {importReport.skipped} trùng)
                    </span>
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
