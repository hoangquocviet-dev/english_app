import {
  Check,
  Download,
  FileText,
  Globe,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommunityDeck, Deck, StudyMode, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { cloudSyncService, OFFICIAL_DAILY_DECK_ID } from '../../utils/cloudSync'
import { storageService } from '../../utils/storage'
import { ImportExportModal } from './ImportExportModal'

const PAGE_SIZE = 30

function stripAccents(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

interface LibraryViewProps {
  decks: Deck[]
  activeDeck: Deck
  words: WordItem[]
  allWords: WordItem[]
  onSelectDeck: (deckId: string) => void
  onDataChanged: () => void
  onGoToAddWord: () => void
  onStartFilteredStudy?: (
    customWords: WordItem[],
    mode: StudyMode,
    label: string,
    isCrossDeck: boolean
  ) => void
}

export function LibraryView({
  decks,
  activeDeck,
  words,
  allWords,
  onSelectDeck,
  onDataChanged,
  onGoToAddWord,
  onStartFilteredStudy,
}: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchAllDecks, setSearchAllDecks] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'mastered' | 'review' | 'due' | 'starred'>('all')
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [isCreatingDeck, setIsCreatingDeck] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null)
  const [renameDeckDraft, setRenameDeckDraft] = useState('')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const activeDeckCardRef = useRef<HTMLDivElement | null>(null)

  // Community Decks State
  const [isCommunityOpen, setIsCommunityOpen] = useState(false)
  const [communityDecks, setCommunityDecks] = useState<CommunityDeck[]>([])
  const [isLoadingCommunity, setIsLoadingCommunity] = useState(false)
  const [sharedDeckIds, setSharedDeckIds] = useState<Set<string>>(() =>
    cloudSyncService.getSharedDeckIds()
  )
  const [isPublishingDeck, setIsPublishingDeck] = useState(false)
  const [communityFeedback, setCommunityFeedback] = useState<string | null>(null)

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

  const nowMs = storageService.getNowMs()
  const sourceWords = searchAllDecks ? allWords : words

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const qPlain = q ? stripAccents(q) : ''
    const useAccentFree = Boolean(q && q === qPlain)
    const deckNames = searchAllDecks
      ? new Map(decks.map((d) => [d.id, d.name.toLowerCase()]))
      : null

    return sourceWords.filter((w) => {
      if (q) {
        const matchesDirect =
          w.term.toLowerCase().includes(q) ||
          w.definition.toLowerCase().includes(q) ||
          Boolean(w.example && w.example.toLowerCase().includes(q)) ||
          Boolean(w.ipa && w.ipa.toLowerCase().includes(q)) ||
          Boolean(deckNames && deckNames.get(w.deckId)?.includes(q))

        const matchesUnaccented =
          !matchesDirect && useAccentFree && stripAccents(w.definition).includes(qPlain)

        if (!matchesDirect && !matchesUnaccented) return false
      }

      if (statusFilter === 'starred') return Boolean(w.starred)
      if (statusFilter === 'mastered') return w.status === 'mastered'
      if (statusFilter === 'due') {
        return w.status === 'mastered' && (!w.nextReview || w.nextReview <= nowMs)
      }
      if (statusFilter === 'review') return w.status === 'learning' || w.status === 'new'
      return true
    })
  }, [sourceWords, searchQuery, searchAllDecks, decks, statusFilter, nowMs])

  const visibleWords = useMemo(
    () => filteredWords.slice(0, visibleLimit),
    [filteredWords, visibleLimit]
  )
  const hasMore = visibleLimit < filteredWords.length

  // Progressive infinite scroll: mount only 30 DOM cards at a time so 1,000-10,000+ words never lag!
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => prev + PAGE_SIZE)
        }
      },
      { rootMargin: '280px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, filteredWords.length])

  // Keep active deck card visible inside horizontal carousel when switching decks/tabs
  useEffect(() => {
    activeDeckCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [activeDeck.id])

  const fetchCommunityList = async () => {
    setIsLoadingCommunity(true)
    const list = await cloudSyncService.fetchCommunityDecks(25)
    setCommunityDecks(list)
    setIsLoadingCommunity(false)
  }

  const handleToggleCommunityPanel = () => {
    audioService.playClick()
    const next = !isCommunityOpen
    setIsCommunityOpen(next)
    if (next) {
      void fetchCommunityList()
    }
  }

  const handleToggleShareDeck = async (deck: Deck) => {
    if (deck.isBuiltIn || deck.id.startsWith('commdeck-') || isPublishingDeck) return
    audioService.playClick()
    const deckWords = storageService.getWords(deck.id)

    if (!sharedDeckIds.has(deck.id) && deckWords.length === 0) {
      setCommunityFeedback('Hãy thêm ít nhất 1 từ vào bộ này trước khi chia sẻ lên Cộng đồng nhé!')
      return
    }

    setIsPublishingDeck(true)
    setCommunityFeedback(null)

    if (sharedDeckIds.has(deck.id)) {
      const ok = await cloudSyncService.unpublishCommunityDeck(deck.id)
      setSharedDeckIds(cloudSyncService.getSharedDeckIds())
      setCommunityFeedback(
        ok ? `Đã gỡ bộ "${deck.name}" khỏi Kho Cộng đồng.` : 'Chưa kết nối được Cloud.'
      )
    } else {
      const ok = await cloudSyncService.publishCommunityDeck(deck, deckWords)
      setSharedDeckIds(cloudSyncService.getSharedDeckIds())
      if (ok) {
        audioService.playSuccessChime()
        setCommunityFeedback(
          `Đã chia sẻ bộ "${deck.name}" (${deckWords.length} từ) lên Kho Cộng đồng!`
        )
        if (isCommunityOpen) {
          void fetchCommunityList()
        }
      } else {
        setCommunityFeedback('Không thể chia sẻ lúc này. Vui lòng kiểm tra kết nối mạng.')
      }
    }
    setIsPublishingDeck(false)
  }

  const handleDownloadCommunityDeck = (commDeck: CommunityDeck) => {
    const localDeckId = storageService.upsertCommunityDeckLocally(commDeck)
    audioService.playSuccessChime()
    setSearchAllDecks(false)
    setVisibleLimit(PAGE_SIZE)
    onSelectDeck(localDeckId)
    onDataChanged()
    setCommunityFeedback(`Đã tải bộ "${commDeck.name}" (${commDeck.word_count} từ) về máy!`)
  }

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

  const handleRenameDeckSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingDeckId || !renameDeckDraft.trim()) return
    const ok = storageService.renameDeck(renamingDeckId, renameDeckDraft)
    if (ok) {
      audioService.playSuccessChime()
      onDataChanged()
    }
    setRenamingDeckId(null)
    setRenameDeckDraft('')
  }

  const handleDeleteDeck = (deck: Deck) => {
    if (deck.isBuiltIn) return
    setConfirmAction({
      title: 'Xóa bộ từ vựng',
      message: `Bạn có chắc muốn xóa bộ từ "${deck.name}" cùng toàn bộ thẻ bên trong?`,
      confirmLabel: 'Xóa bộ từ',
      isDanger: true,
      onConfirm: () => {
        if (sharedDeckIds.has(deck.id)) {
          void cloudSyncService.unpublishCommunityDeck(deck.id).then(() => {
            setSharedDeckIds(cloudSyncService.getSharedDeckIds())
          })
        }
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
        void storageService.resetDeckProgress(activeDeck.id).then(() => {
          audioService.playSuccessChime()
          onDataChanged()
          setConfirmAction(null)
        })
      },
    })
  }

  const handleToggleWordStar = (word: WordItem) => {
    storageService.toggleWordStar(word.id)
    audioService.playClick()
    onDataChanged()
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

  const starredTotal = useMemo(
    () => sourceWords.filter((w) => Boolean(w.starred)).length,
    [sourceWords]
  )
  const masteredTotal = useMemo(
    () => sourceWords.filter((w) => w.status === 'mastered').length,
    [sourceWords]
  )
  const dueTotal = useMemo(
    () => sourceWords.filter((w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= nowMs)).length,
    [sourceWords, nowMs]
  )
  const allMasteredTotal = useMemo(
    () => allWords.filter((w) => w.status === 'mastered').length,
    [allWords]
  )
  const deckCountMap = useMemo(
    () =>
      allWords.reduce<Record<string, number>>((acc, w) => {
        acc[w.deckId] = (acc[w.deckId] || 0) + 1
        return acc
      }, {}),
    [allWords]
  )
  const deckNameMap = useMemo(
    () =>
      decks.reduce<Record<string, string>>((acc, d) => {
        acc[d.id] = d.name
        return acc
      }, {}),
    [decks]
  )

  const isOwnCustomDeck =
    !activeDeck.isBuiltIn && !activeDeck.id.startsWith('commdeck-') && !searchAllDecks
  const isActiveDeckShared = sharedDeckIds.has(activeDeck.id)

  return (
    <div className="w-full max-w-md sm:max-w-xl mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      {/* Top Header & Action Buttons */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Kho từ vựng</h2>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              {allWords.length.toLocaleString()} từ
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {decks.length} bộ chủ đề • Đã thuộc: {allMasteredTotal}/{allWords.length.toLocaleString()} từ
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleCommunityPanel}
            className={`py-2 px-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 border ${
              isCommunityOpen
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cộng đồng</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSyncModalOpen(true)}
            title="Nhập / Xuất file CSV hoặc JSON"
            className="py-2 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center gap-1 transition-transform active:scale-95 border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>File</span>
          </button>
        </div>
      </div>

      {communityFeedback && (
        <div className="p-2.5 px-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2 animate-fadeIn">
          <span>{communityFeedback}</span>
          <button
            type="button"
            onClick={() => setCommunityFeedback(null)}
            className="text-emerald-600 dark:text-emerald-400 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Community Shared Decks Drawer */}
      {isCommunityOpen && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-indigo-500/30 shadow-sm space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span>Kho Bộ Từ Cộng Đồng Chia Sẻ</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Tải miễn phí các bộ từ chuyên ngành do người học khác đóng góp
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchCommunityList()}
              aria-label="Làm mới kho cộng đồng"
              className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCommunity ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingCommunity ? (
            <div className="py-5 text-center text-xs text-slate-400 font-medium">
              Đang tải danh sách bộ từ cộng đồng...
            </div>
          ) : communityDecks.length === 0 ? (
            <div className="py-4 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Kho cộng đồng đang chờ bộ từ đầu tiên!
              </p>
              <p className="text-[11px] text-slate-400">
                Tạo bộ từ riêng của bạn rồi bấm nút "Chia sẻ lên Cộng đồng" để mọi người cùng học nhé.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {communityDecks.map((cd) => {
                const localId = `commdeck-${cd.id}`
                const alreadyInstalled = Boolean(deckNameMap[localId])
                const sampleTerms = cd.words
                  .slice(0, 3)
                  .map((w) => w.term)
                  .join(', ')

                return (
                  <div
                    key={cd.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {cd.name}
                        </span>
                        {cd.id === OFFICIAL_DAILY_DECK_ID && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            ⚡ Tự động
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          {cd.word_count} từ
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Bởi <span className="font-semibold">{cd.author_name}</span>
                        {sampleTerms ? ` • VD: ${sampleTerms}` : ''}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadCommunityDeck(cd)}
                      className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all active:scale-95 ${
                        alreadyInstalled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs'
                      }`}
                    >
                      {alreadyInstalled ? (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Cập nhật</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          <span>Tải về</span>
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Decks Horizontal Carousel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
          <span>Danh sách bộ từ ({decks.length} bộ)</span>
          <button
            onClick={() => setIsCreatingDeck((prev) => !prev)}
            className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline normal-case"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo bộ mới</span>
          </button>
        </div>

        {/* Create or Rename Deck inline form */}
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

        {renamingDeckId && (
          <form
            onSubmit={handleRenameDeckSubmit}
            className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-sky-500/30 flex gap-2 animate-fadeIn"
          >
            <input
              type="text"
              autoFocus
              value={renameDeckDraft}
              onChange={(e) => setRenameDeckDraft(e.target.value)}
              placeholder="Nhập tên mới cho bộ từ..."
              className="flex-1 py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            <button
              type="submit"
              className="py-1.5 px-3 rounded-xl bg-sky-600 text-white font-semibold text-xs shrink-0"
            >
              Đổi tên
            </button>
            <button
              type="button"
              onClick={() => setRenamingDeckId(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        <div
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
          className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none"
        >
          {decks.map((deck) => {
            const isSelected = deck.id === activeDeck.id
            const deckWordCount = deckCountMap[deck.id] || 0
            const isShared = sharedDeckIds.has(deck.id)
            const isCommunityDownloaded = deck.id.startsWith('commdeck-')

            return (
              <div
                key={deck.id}
                ref={isSelected ? activeDeckCardRef : null}
                onClick={() => {
                  setSearchAllDecks(false)
                  setVisibleLimit(PAGE_SIZE)
                  onSelectDeck(deck.id)
                }}
                className={`p-3.5 rounded-2xl border min-w-44 cursor-pointer transition-all shrink-0 flex flex-col justify-between ${
                  isSelected && !searchAllDecks
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <span
                    className={`text-xs font-bold leading-snug line-clamp-2 ${
                      isSelected && !searchAllDecks
                        ? 'text-white'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {deck.name}
                  </span>
                  {!deck.isBuiltIn && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          audioService.playClick()
                          setIsCreatingDeck(false)
                          setRenamingDeckId(deck.id)
                          setRenameDeckDraft(deck.name)
                        }}
                        className={`p-1 rounded-md transition-colors ${
                          isSelected
                            ? 'text-indigo-200 hover:text-white'
                            : 'text-slate-400 hover:text-sky-500'
                        }`}
                        title="Đổi tên bộ từ"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
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
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] opacity-85 pt-1">
                  <span>{deckWordCount} từ</span>
                  {deck.isBuiltIn ? (
                    <span className="text-[10px] font-medium">Hệ thống</span>
                  ) : isCommunityDownloaded ? (
                    <span className="text-[10px] font-semibold">Cộng đồng</span>
                  ) : isShared ? (
                    <span className="text-[10px] font-bold">Đã chia sẻ</span>
                  ) : (
                    <span className="text-[10px] font-medium">Cá nhân</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Share Custom Deck Banner (Visible whenever user selects their own custom deck) */}
        {isOwnCustomDeck && (
          <div className="p-2.5 px-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {isActiveDeckShared
                  ? 'Bộ từ này đang chia sẻ công khai trên Cộng đồng'
                  : 'Chia sẻ bộ từ riêng này cho mọi người cùng học?'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {isActiveDeckShared
                  ? 'Khi bạn thêm từ mới, hệ thống tự động cập nhật lên Kho Cộng đồng'
                  : 'Giúp bạn bè và cộng đồng VocabFlow tải về học chỉ với 1 chạm'}
              </div>
            </div>
            <button
              type="button"
              disabled={isPublishingDeck}
              onClick={() => void handleToggleShareDeck(activeDeck)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all active:scale-95 ${
                isActiveDeckShared
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {isActiveDeckShared ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã chia sẻ</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Chia sẻ</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Word Search & Status Filter */}
      <div className="space-y-3 pt-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setVisibleLimit(PAGE_SIZE)
              }}
              placeholder={
                searchAllDecks
                  ? `Tìm trên toàn bộ ${allWords.length.toLocaleString()} từ...`
                  : `Tìm kiếm trong "${activeDeck.name}"...`
              }
              className="w-full py-2.5 pl-9 pr-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setVisibleLimit(PAGE_SIZE)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              audioService.playClick()
              setSearchAllDecks((prev) => !prev)
              setVisibleLimit(PAGE_SIZE)
            }}
            className={`px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              searchAllDecks
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
            title="Bật để tra cứu trên toàn bộ các bộ từ"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Toàn kho</span>
          </button>
        </div>

        {/* Filter Pills + Reset Progress */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none min-w-0 flex-1">
            <button
              onClick={() => {
                setStatusFilter('all')
                setVisibleLimit(PAGE_SIZE)
              }}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Tất cả ({sourceWords.length})
            </button>
            <button
              onClick={() => {
                setStatusFilter('mastered')
                setVisibleLimit(PAGE_SIZE)
              }}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                statusFilter === 'mastered'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Đã thuộc ({masteredTotal})
            </button>
            <button
              onClick={() => {
                setStatusFilter('review')
                setVisibleLimit(PAGE_SIZE)
              }}
              className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                statusFilter === 'review'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              Cần ôn ({sourceWords.length - masteredTotal})
            </button>
            {dueTotal > 0 && (
              <button
                onClick={() => {
                  setStatusFilter((prev) => (prev === 'due' ? 'all' : 'due'))
                  setVisibleLimit(PAGE_SIZE)
                }}
                className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  statusFilter === 'due'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                }`}
              >
                Đến hạn ({dueTotal})
              </button>
            )}
            {starredTotal > 0 && (
              <button
                onClick={() => {
                  setStatusFilter((prev) => (prev === 'starred' ? 'all' : 'starred'))
                  setVisibleLimit(PAGE_SIZE)
                }}
                className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-all ${
                  statusFilter === 'starred'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                <span>Đã lưu ({starredTotal})</span>
              </button>
            )}
          </div>

          {!searchAllDecks && (
            <button
              onClick={handleResetProgress}
              title="Đặt lại tiến độ học của bộ từ này"
              className="py-1.5 px-2.5 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>

        {/* Instant Focused Study Bar when user searches or filters words in Library */}
        {onStartFilteredStudy &&
          filteredWords.length > 0 &&
          (Boolean(searchQuery.trim()) || statusFilter !== 'all' || searchAllDecks) && (
            <div className="p-2.5 px-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2 flex-wrap animate-fadeIn">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Luyện nhanh {filteredWords.length.toLocaleString()} thẻ đang lọc:</span>
              </div>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { mode: 'flashcard', label: 'Flashcard' },
                    { mode: 'quiz', label: 'Quiz' },
                    { mode: 'cloze', label: 'Cloze' },
                  ] as const
                ).map((item) => {
                  const customLabel = searchQuery.trim()
                    ? `Tìm kiếm: "${searchQuery.trim()}"`
                    : searchAllDecks
                    ? 'Lọc Toàn kho'
                    : `${activeDeck.name} (Đã lọc)`

                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => {
                        audioService.playClick()
                        onStartFilteredStudy(filteredWords, item.mode, customLabel, searchAllDecks)
                      }}
                      className="py-1 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap active:scale-95 transition-all"
                    >
                      {item.mode === 'flashcard' && <Layers className="w-3 h-3" />}
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
      </div>

      {/* Words List (Windowed progressive rendering for zero lag at 10,000+ words) */}
      <div className="space-y-2.5">
        {filteredWords.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-3 font-medium">
              Không tìm thấy từ vựng nào phù hợp.
            </p>
            {!searchAllDecks && searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setSearchAllDecks(true)
                  setVisibleLimit(PAGE_SIZE)
                }}
                className="py-2 px-3 rounded-xl bg-indigo-600 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-xs"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Tìm "{searchQuery.trim()}" trên toàn kho ({allWords.length.toLocaleString()} từ)</span>
              </button>
            ) : (
              <button
                onClick={onGoToAddWord}
                className="py-2 px-3 rounded-xl bg-indigo-600 text-white font-medium text-xs inline-flex items-center gap-1 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm từ mới</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {visibleWords.map((word) => {
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
                      {isMastered && typeof word.srsLevel === 'number' && word.srsLevel > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          SRS Lv.{word.srsLevel}
                          {word.nextReview
                            ? word.nextReview <= nowMs
                              ? ' • Đến hạn'
                              : ` • ${Math.max(1, Math.ceil((word.nextReview - nowMs) / 86400000))}d`
                            : ''}
                        </span>
                      )}
                      {searchAllDecks && deckNameMap[word.deckId] && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 truncate max-w-40">
                          {deckNameMap[word.deckId]}
                        </span>
                      )}
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
                      type="button"
                      onClick={() => handleToggleWordStar(word)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        word.starred
                          ? 'text-amber-500'
                          : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                      }`}
                      title={word.starred ? 'Bỏ đánh dấu sao' : 'Đánh dấu sao từ quan trọng'}
                    >
                      <Star className={`w-4 h-4 ${word.starred ? 'fill-amber-400' : ''}`} />
                    </button>
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
            })}

            {hasMore && (
              <div
                ref={loadMoreRef}
                className="py-3 text-center text-xs font-medium text-slate-400 dark:text-slate-500"
              >
                Đang hiển thị {visibleWords.length} / {filteredWords.length.toLocaleString()} thẻ • Cuộn xuống để tải tiếp...
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Word Modal */}
      {editingWord && (
        <div
          role="dialog"
          aria-modal="true"
          data-no-pull="true"
          onClick={() => setEditingWord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
        >
          <form
            onClick={(e) => e.stopPropagation()}
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
        <div
          role="dialog"
          aria-modal="true"
          data-no-pull="true"
          onClick={() => setConfirmAction(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-center"
          >
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
      {isSyncModalOpen && (
        <ImportExportModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          activeDeck={activeDeck}
          decks={decks}
          words={words}
          onSelectDeck={onSelectDeck}
          onDataChanged={onDataChanged}
        />
      )}
    </div>
  )
}
