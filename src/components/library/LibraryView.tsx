import { FileText, Plus, Search, Trash2, Volume2 } from 'lucide-react'
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

  // Filter words
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

    storageService.createDeck(name)
    setNewDeckName('')
    setIsCreatingDeck(false)
    audioService.playClick()
    onDataChanged()
  }

  const handleDeleteDeck = (deck: Deck) => {
    if (deck.isBuiltIn) {
      alert('Không thể xóa bộ từ mặc định của hệ thống.')
      return
    }
    if (window.confirm(`Xóa bộ từ "${deck.name}" và toàn bộ thẻ bên trong?`)) {
      storageService.deleteDeck(deck.id)
      audioService.playClick()
      onDataChanged()
    }
  }

  const handleDeleteWord = (word: WordItem) => {
    if (window.confirm(`Xóa thẻ "${word.term}" khỏi bộ từ?`)) {
      storageService.deleteWord(word.id)
      audioService.playClick()
      onDataChanged()
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-5 animate-fadeIn">
      {/* Top Header & Sync Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Kho từ vựng</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Quản lý các bộ từ và đồng bộ với daily-english
          </p>
        </div>
        <button
          onClick={() => setIsSyncModalOpen(true)}
          className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center gap-1.5 transition-transform active:scale-95 border border-slate-200 dark:border-slate-700"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-500" />
          <span>Đồng bộ file</span>
        </button>
      </div>

      {/* Decks Horizontal Carousel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
          <span>Danh sách bộ từ ({decks.length})</span>
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
          <form onSubmit={handleCreateDeck} className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-indigo-500/30 flex gap-2 animate-fadeIn">
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
            const deckWordCount = storageService.getWords(deck.id).length

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
                  <span className={`text-xs font-bold leading-snug line-clamp-2 ${isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                    {deck.name}
                  </span>
                  {!deck.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDeck(deck)
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-400 transition-colors"
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
      <div className="space-y-3 pt-2">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Tìm kiếm trong "${activeDeck.name}"...`}
            className="w-full py-2.5 pl-9 pr-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            Tất cả ({words.length})
          </button>
          <button
            onClick={() => setStatusFilter('mastered')}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'mastered'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            Đã thuộc ({words.filter((w) => w.status === 'mastered').length})
          </button>
          <button
            onClick={() => setStatusFilter('review')}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'review'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            Cần ôn ({words.filter((w) => w.status !== 'mastered').length})
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
          filteredWords.map((word) => (
            <div
              key={word.id}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {word.term}
                  </span>
                  {word.ipa && (
                    <span className="text-xs font-mono text-slate-400">
                      {word.ipa}
                    </span>
                  )}
                  {word.status === 'mastered' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Đã thuộc" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {word.definition}
                </p>
                {word.example && (
                  <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-1">
                    "{word.example}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => audioService.speak(word.term)}
                  className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Nghe phát âm"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteWord(word)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                  title="Xóa từ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

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
