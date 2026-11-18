import { Check, FileText, Pencil, Plus, RotateCcw, Search, Trash2, Volume2, X } from 'lucide-react'
import { useState } from 'react'
import type { Deck, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'
import { ImportExportModal } from './ImportExportModal'

interface LibraryViewProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  onSelectDeck: (deckId: string) => void
  onDataChanged: () => void
  onGoToAddWord: () => void
}

export function LibraryView({
  decks,
  activeDeck,
  words,
  onSelectDeck,
  onDataChanged,
  onGoToAddWord,
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'mastered' | 'review'>('all')
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [isCreatingDeck, setIsCreatingDeck] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')

  // Edit Word Modal State
  const [editingWord, setEditingWord] = useState<WordItem | null>(null)
  const [editTerm, setEditTerm] = useState('')
  const [editIpa, setEditIpa] = useState('')
  const [editPos, setEditPos] = useState('noun')
  const [editDef, setEditDef] = useState('')
  const [editExample, setEditExample] = useState('')

  // Custom Confirm Dialog State
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    message: string
    confirmLabel: string
    isDanger?: boolean
    onConfirm: () => void
  } | null>(null)

  const filteredWords = words.filter((w) => {
    const matchesSearch =
      w.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.ipa && w.ipa.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    if (statusFilter === 'mastered') return w.status === 'mastered'
    if (statusFilter === 'review') return w.status === 'learning' || w.status === 'new'
    return true
  })

  const handleCreateDeck = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newDeckName.trim()
    if (!name) return

    const created = storageService.createDeck(name)
    setNewDeckName('')
    setIsCreatingDeck(false)
    audioService.playClick()
    onSelectDeck(created.id)
    onDataChanged()
  }

  const handleDeleteDeck = (deck: Deck) => {
    if (deck.isBuiltIn) return
    setConfirmAction({
      title: 'Xóa bộ từ vựng',
      message: `Bạn có chắc muốn xóa bộ từ "${deck.name}" cùng toàn bộ thẻ bên trong?`,
      confirmLabel: 'Xóa bộ từ',
      isDanger: true,
      onConfirm: () => {
        storageService.deleteDeck(deck.id)
        audioService.playClick()
        onDataChanged()
        setConfirmAction(null)
      },
    })
  }

  const handleDeleteWord = (word: WordItem) => {
    setConfirmAction({
      title: 'Xóa thẻ từ vựng',
      message: `Xóa thẻ "${word.term}" khỏi bộ từ "${activeDeck.name}"?`,
      confirmLabel: 'Xóa thẻ',
      isDanger: true,
      onConfirm: () => {
        storageService.deleteWord(word.id)
        audioService.playClick()
        onDataChanged()
        setConfirmAction(null)
      },
    })
  }

  const handleResetProgress = () => {
    setConfirmAction({
      title: 'Đặt lại tiến độ học',
      message: `Đặt lại toàn bộ trạng thái thẻ trong "${activeDeck.name}" về ban đầu (và khôi phục từ mặc định nếu đã xóa)?`,
      confirmLabel: 'Đặt lại',
      isDanger: false,
      onConfirm: () => {
        storageService.resetDeckProgress(activeDeck.id)
        audioService.playSuccessChime()
        onDataChanged()
        setConfirmAction(null)
      },
    })
  }

  const handleToggleWordStatus = (word: WordItem) => {
    const nextStatus = word.status === 'mastered' ? 'learning' : 'mastered'
    storageService.updateWordStatus(word.id, nextStatus, false)
    audioService.playClick()
    onDataChanged()
  }

  const openEditModal = (word: WordItem) => {
    audioService.playClick()
    setEditingWord(word)
    setEditTerm(word.term)
    setEditIpa(word.ipa || '')
    setEditPos(word.partOfSpeech || 'noun')
    setEditDef(word.definition)
    setEditExample(word.example || '')
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWord || !editTerm.trim() || !editDef.trim()) return

    storageService.updateWord({
      ...editingWord,
      term: editTerm.trim(),
      ipa: editIpa.trim() || undefined,
      partOfSpeech: editPos.trim() || undefined,
      definition: editDef.trim(),
      example: editExample.trim() || undefined,
    })

    audioService.playSuccessChime()
    setEditingWord(null)
    onDataChanged()
  }

  const masteredTotal = words.filter((w) => w.status === 'mastered').length
  const allLibraryWords = storageService.getWords()
  const allMasteredTotal = allLibraryWords.filter((w) => w.status === 'mastered').length
  const deckCountMap = allLibraryWords.reduce<Record<string, number>>((acc, w) => {
    acc[w.deckId] = (acc[w.deckId] || 0) + 1
    return acc
  }, {})

  return (
    <div className="w-full max-w-md mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Top Header & Sync Button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Kho từ vựng</h2>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              {allLibraryWords.length} từ
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tổng {decks.length} bộ chủ đề • Đã thuộc toàn kho: {allMasteredTotal}/{allLibraryWords.length} từ
          </p>
        </div>
        <button
          onClick={() => setIsSyncModalOpen(true)}
          className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center gap-1.5 transition-transform active:scale-95 border border-slate-200 dark:border-slate-700 shrink-0"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-500" />
          <span>Đồng bộ file</span>
        </button>
      </div>

      {/* Decks Horizontal Carousel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
          <span>Danh sách bộ từ ({decks.length} bộ)</span>
          <button
            onClick={() => setIsCreatingDeck((prev) => !prev)}
            className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline lowercase first-letter:uppercase"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo bộ mới</span>
          </button>
        </div>

        {/* Create Deck inline form */}
        {isCreatingDeck && (
          <form
            onSubmit={handleCreateDeck}
            className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-indigo-500/30 flex gap-2 animate-fadeIn"
          >
            <input
              type="text"
              autoFocus
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              placeholder="Nhập tên bộ từ mới..."
              className="flex-1 py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            <button
              type="submit"
              className="py-1.5 px-3 rounded-xl bg-indigo-600 text-white font-medium text-xs shrink-0"
            >
              Lưu
            </button>
          </form>
        )}

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
          {decks.map((deck) => {
            const isSelected = deck.id === activeDeck.id
            const deckWordCount = deckCountMap[deck.id] || 0

            return (
              <div
                key={deck.id}
                onClick={() => onSelectDeck(deck.id)}
                className={`p-3.5 rounded-2xl border min-w-44 cursor-pointer transition-all shrink-0 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <span
                    className={`text-xs font-bold leading-snug line-clamp-2 ${
                      isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {deck.name}
                  </span>
                  {!deck.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDeck(deck)
                      }}
                      className={`p-1 rounded-md transition-colors ${
                        isSelected
                          ? 'text-indigo-200 hover:text-white'
                          : 'text-slate-400 hover:text-rose-500'
                      }`}
                      title="Xóa bộ từ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] opacity-80 pt-1">
                  <span>{deckWordCount} từ</span>
                  {deck.isBuiltIn && <span className="text-[10px] font-medium">Hệ thống</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Word Search & Status Filter */}
      <div className="space-y-3 pt-1">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Tìm kiếm trong "${activeDeck.name}"...`}
            className="w-full py-2.5 pl-9 pr-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills + Reset Progress */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Tất cả ({words.length})
            </button>
            <button
              onClick={() => setStatusFilter('mastered')}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === 'mastered'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Đã thuộc ({masteredTotal})
            </button>
            <button
              onClick={() => setStatusFilter('review')}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === 'review'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Cần ôn ({words.length - masteredTotal})
            </button>
          </div>

          <button
            onClick={handleResetProgress}
            title="Đặt lại tiến độ học của bộ từ này"
            className="py-1.5 px-2.5 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Đặt lại</span>
          </button>
        </div>
      </div>

      {/* Words List */}
      <div className="space-y-2.5">
        {filteredWords.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-3 font-medium">
              Không tìm thấy từ vựng nào phù hợp.
            </p>
            <button
              onClick={onGoToAddWord}
              className="py-2 px-3 rounded-xl bg-indigo-600 text-white font-medium text-xs inline-flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm từ mới</span>
            </button>
          </div>
        ) : (
          filteredWords.map((word) => {
            const isMastered = word.status === 'mastered'
            return (
              <div
                key={word.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5 mb-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {word.term}
                    </span>
                    {word.ipa && (
                      <span className="text-xs font-sans font-medium tracking-wide text-slate-400">
                        {word.ipa}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleWordStatus(word)}
                      title="Chạm để đổi trạng thái Đã thuộc / Cần ôn"
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                        isMastered
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : word.status === 'learning'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isMastered ? 'Đã thuộc' : word.status === 'learning' ? 'Đang ôn' : 'Mới'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                    {word.definition}
                  </p>
                  {word.example && (
                    <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-2">
                      "{word.example}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => audioService.speak(word.term)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Nghe phát âm"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(word)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 transition-colors"
                    title="Sửa thẻ từ"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteWord(word)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                    title="Xóa từ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Edit Word Modal */}
      {editingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Chỉnh sửa thẻ từ vựng
              </h3>
              <button
                type="button"
                onClick={() => setEditingWord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">
                Từ tiếng Anh *
              </label>
              <input
                type="text"
                required
                value={editTerm}
                onChange={(e) => setEditTerm(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Phiên âm IPA
                </label>
                <input
                  type="text"
                  value={editIpa}
                  onChange={(e) => setEditIpa(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-sans text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Từ loại</label>
                <select
                  value={editPos}
                  onChange={(e) => setEditPos(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="verb">verb</option>
                  <option value="noun">noun</option>
                  <option value="adj">adj</option>
                  <option value="adv">adv</option>
                  <option value="phrase">phrase</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">
                Nghĩa tiếng Việt *
              </label>
              <input
                type="text"
                required
                value={editDef}
                onChange={(e) => setEditDef(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Câu ví dụ</label>
              <textarea
                rows={2}
                value={editExample}
                onChange={(e) => setEditExample(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setEditingWord(null)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-center">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {confirmAction.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {confirmAction.message}
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => setConfirmAction(null)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className={`py-2.5 rounded-xl text-white font-semibold text-xs ${
                  confirmAction.isDanger
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      <ImportExportModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        activeDeck={activeDeck}
        decks={decks}
        words={words}
        onDataChanged={onDataChanged}
      />
    </div>
  )
}
