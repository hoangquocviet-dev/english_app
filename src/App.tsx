import { Check, AlertCircle, X } from 'lucide-react'
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { PullToRefresh } from './components/common/PullToRefresh'
import {
  ALL_DECKS_ID,
  ArcadeHub,
  LEARNING_POOL_ID,
  STARRED_POOL_ID,
} from './components/games/ArcadeHub'
import { PracticeHome } from './components/practice/PracticeHome'
import type { ActiveTab, ArcadeGameId, Deck, StudyFilterMode, StudyMode, WordItem } from './types'
import { audioService } from './utils/audio'
import { cloudSyncService } from './utils/cloudSync'
import { forceReloadApp } from './utils/reload'
import { GLOBAL_SRS_DECK_ID, storageService } from './utils/storage'

function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (err) {
      if (typeof window !== 'undefined') {
        const key = 'vocabflow_chunk_reload_at'
        const lastReload = Number(window.sessionStorage.getItem(key) || '0')
        if (Date.now() - lastReload > 10000) {
          window.sessionStorage.setItem(key, String(Date.now()))
          await forceReloadApp()
        }
      }
      throw err
    }
  })
}

const FlashcardView = lazyWithRetry(() =>
  import('./components/practice/FlashcardView').then((m) => ({ default: m.FlashcardView }))
)
const QuizView = lazyWithRetry(() =>
  import('./components/practice/QuizView').then((m) => ({ default: m.QuizView }))
)
const SpellingView = lazyWithRetry(() =>
  import('./components/practice/SpellingView').then((m) => ({ default: m.SpellingView }))
)
const ListeningView = lazyWithRetry(() =>
  import('./components/practice/ListeningView').then((m) => ({ default: m.ListeningView }))
)
const ClozeView = lazyWithRetry(() =>
  import('./components/practice/ClozeView').then((m) => ({ default: m.ClozeView }))
)
const SmartMixView = lazyWithRetry(() =>
  import('./components/practice/SmartMixView').then((m) => ({ default: m.SmartMixView }))
)
const SkyDefenderGame = lazyWithRetry(() =>
  import('./components/games/SkyDefenderGame').then((m) => ({ default: m.SkyDefenderGame }))
)
const SpeedMatchGame = lazyWithRetry(() =>
  import('./components/games/SpeedMatchGame').then((m) => ({ default: m.SpeedMatchGame }))
)
const BlitzGame = lazyWithRetry(() =>
  import('./components/games/BlitzGame').then((m) => ({ default: m.BlitzGame }))
)
const WordBombGame = lazyWithRetry(() =>
  import('./components/games/WordBombGame').then((m) => ({ default: m.WordBombGame }))
)
const AddWordView = lazyWithRetry(() =>
  import('./components/add/AddWordView').then((m) => ({ default: m.AddWordView }))
)
const LibraryView = lazyWithRetry(() =>
  import('./components/library/LibraryView').then((m) => ({ default: m.LibraryView }))
)
const CloudSyncModal = lazyWithRetry(() =>
  import('./components/common/CloudSyncModal').then((m) => ({ default: m.CloudSyncModal }))
)
const StatsModal = lazyWithRetry(() =>
  import('./components/common/StatsModal').then((m) => ({ default: m.StatsModal }))
)

function dedupeCrossDeckTerms(list: WordItem[]): WordItem[] {
  const seen = new Set<string>()
  const out: WordItem[] = []
  for (const w of list) {
    const key = w.term.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(w)
    }
  }
  return out
}

function ViewLoader() {
  return (
    <div className="w-full flex-1 flex items-center justify-center p-8">
      <div className="w-7 h-7 rounded-full border-3 border-indigo-500/30 border-t-indigo-500 animate-spin" />
    </div>
  )
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('practice')
  const [activeStudyMode, setActiveStudyMode] = useState<StudyMode | null>(null)
  const [activeGame, setActiveGame] = useState<ArcadeGameId | null>(null)
  const [arcadePoolId, setArcadePoolId] = useState<string>('')
  const [sessionWords, setSessionWords] = useState<WordItem[]>([])
  const [sessionSeq, setSessionSeq] = useState(0)
  const [sessionFilterMode, setSessionFilterMode] = useState<StudyFilterMode>('all')
  const [isGlobalSrsSession, setIsGlobalSrsSession] = useState(false)
  const [customSessionLabel, setCustomSessionLabel] = useState<string | null>(null)
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false)
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false)
  const [syncToast, setSyncToast] = useState<{ ok: boolean; message: string } | null>(null)

  const [decks, setDecks] = useState<Deck[]>(() => storageService.getDecks())
  const [activeDeckId, setActiveDeckId] = useState<string>(() => storageService.getActiveDeckId())
  const [words, setWords] = useState<WordItem[]>(() =>
    storageService.getWords(storageService.getActiveDeckId())
  )
  const [allWords, setAllWords] = useState<WordItem[]>(() => storageService.getWords())
  const [streak, setStreak] = useState<number>(() => storageService.getStudyStreak())
  const [dailyProgress, setDailyProgress] = useState(() => storageService.getDailyProgress())
  const [studyPrefs, setStudyPrefs] = useState(() => storageService.getStudyPreferences())
  const [highScores, setHighScores] = useState(() => storageService.getHighScores())
  const [isSeedLoading, setIsSeedLoading] = useState(() => storageService.needsSeedSync())

  const refreshData = useCallback(() => {
    const loadedDecks = storageService.getDecks()
    const currentActiveDeckId = storageService.getActiveDeckId()
    const validDeckId = loadedDecks.some((d) => d.id === currentActiveDeckId)
      ? currentActiveDeckId
      : loadedDecks[0]?.id || currentActiveDeckId
    const loadedWords = storageService.getWords(validDeckId)

    setDecks(loadedDecks)
    setActiveDeckId(validDeckId)
    setWords(loadedWords)
    setAllWords(storageService.getWords())
    setStreak(storageService.getStudyStreak())
    setDailyProgress(storageService.getDailyProgress())
    setStudyPrefs(storageService.getStudyPreferences())
    setHighScores(storageService.getHighScores())
  }, [])

  // Lazy non-blocking background hydration + Supabase Cloud Sync boot
  useEffect(() => {
    let active = true
    void storageService
      .ensureSeedLoaded()
      .then(async (changed) => {
        if (!active) return
        if (changed) {
          refreshData()
        }
        setIsSeedLoading(false)

        const showNotice = (outcome: { ok: boolean; message: string }) => {
          if (!active) return
          setSyncToast(outcome)
          window.setTimeout(() => {
            if (active) setSyncToast(null)
          }, 5500)
        }

        const magicOutcome = await cloudSyncService.init(
          () => {
            if (active) refreshData()
          },
          showNotice
        )
        if (magicOutcome) {
          showNotice(magicOutcome)
        }

        // Handle deep-links from Telegram Daily-English notifications & PWA Home-Screen Shortcuts (?study=daily or ?tab=...)
        if (active && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const studyTarget = params.get('study')
          const tabTarget = params.get('tab')
          if (studyTarget || tabTarget) {
            params.delete('study')
            params.delete('tab')
            const cleanQ = params.toString()
            window.history.replaceState(
              {},
              '',
              window.location.pathname + (cleanQ ? `?${cleanQ}` : '') + window.location.hash
            )

            if (studyTarget === 'daily') {
              const allDecksNow = storageService.getDecks()
              const dailyDeckId = allDecksNow.some((d) => d.id === 'commdeck-daily-auto')
                ? 'commdeck-daily-auto'
                : storageService.getActiveDeckId()
              storageService.setActiveDeckId(dailyDeckId)
              refreshData()
              const unmasteredDaily = storageService
                .getWords(dailyDeckId)
                .filter((w) => w.status !== 'mastered')
              if (unmasteredDaily.length > 0) {
                const batch = storageService.prepareStudyBatch(unmasteredDaily, 'all')
                setCustomSessionLabel('📅 Bài Mới Daily-English')
                setSessionFilterMode('all')
                setIsGlobalSrsSession(false)
                setSessionWords(batch)
                setSessionSeq((s) => s + 1)
                setActiveStudyMode('smart-mix')
              } else {
                setActiveTab('practice')
              }
            } else if (
              tabTarget === 'practice' ||
              tabTarget === 'games' ||
              tabTarget === 'add' ||
              tabTarget === 'library'
            ) {
              setActiveTab(tabTarget)
              refreshData()
            }
          }
        }
      })
    return () => {
      active = false
    }
  }, [refreshData])

  const handleSelectDeck = (deckId: string) => {
    storageService.setActiveDeckId(deckId)
    setActiveDeckId(deckId)
    setWords(storageService.getWords(deckId))
  }

  const handleSelectArcadeDeck = (deckId: string) => {
    if (
      deckId === ALL_DECKS_ID ||
      deckId === STARRED_POOL_ID ||
      deckId === LEARNING_POOL_ID
    ) {
      setArcadePoolId(deckId)
      setAllWords(storageService.getWords())
    } else {
      setArcadePoolId('')
      handleSelectDeck(deckId)
    }
  }

  const handleResetDeck = (deckId: string) => {
    void storageService.resetDeckProgress(deckId).then(() => {
      refreshData()
    })
  }

  const handleToggleShuffle = () => {
    const next = { ...studyPrefs, shuffle: !studyPrefs.shuffle }
    setStudyPrefs(next)
    storageService.setStudyPreferences(next)
  }

  const handleChangeBatchSize = (batchSize: number) => {
    const next = { ...studyPrefs, batchSize }
    setStudyPrefs(next)
    storageService.setStudyPreferences(next)
  }

  const handleChangeDailyGoal = (goal: number) => {
    const nextDaily = storageService.setDailyGoal(goal)
    setDailyProgress(nextDaily)
  }

  const handleStartMode = (
    mode: StudyMode,
    filterMode: StudyFilterMode = 'all'
  ) => {
    const now = Date.now()
    let targetList: WordItem[]

    if (filterMode === 'global-due') {
      targetList = dedupeCrossDeckTerms(
        storageService
          .getWords()
          .filter((w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= now))
      )
    } else if (filterMode === 'global-learning') {
      targetList = dedupeCrossDeckTerms(
        storageService
          .getWords()
          .filter((w) => w.status === 'learning')
          .sort(
            (a, b) =>
              (b.reviewCount || 0) - (a.reviewCount || 0) ||
              (b.lastReviewed || 0) - (a.lastReviewed || 0)
          )
      )
    } else {
      const freshWords = storageService.getWords(activeDeckId)
      if (filterMode === 'starred') {
        targetList = freshWords.filter((w) => Boolean(w.starred))
      } else if (filterMode === 'due') {
        targetList = freshWords.filter(
          (w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= now)
        )
      } else if (filterMode === 'learning') {
        targetList = freshWords.filter((w) => w.status === 'learning')
      } else {
        targetList = freshWords.filter((w) => w.status !== 'mastered')
      }
    }

    if (targetList.length === 0) return

    targetList = storageService.prepareStudyBatch(targetList, filterMode)

    setCustomSessionLabel(filterMode === 'global-learning' ? 'Ôn tập Từ khó Toàn kho' : null)
    setSessionFilterMode(filterMode)
    setIsGlobalSrsSession(filterMode === 'global-due' || filterMode === 'global-learning')
    setSessionWords(targetList)
    setSessionSeq((s) => s + 1)
    setActiveStudyMode(mode)
  }

  const handleStartCustomSession = (
    customList: WordItem[],
    mode: StudyMode,
    label: string,
    isCrossDeck: boolean
  ) => {
    if (customList.length === 0) return
    const deduped = isCrossDeck ? dedupeCrossDeckTerms(customList) : [...customList]
    const targetList = storageService.prepareStudyBatch(deduped, 'custom')
    setCustomSessionLabel(label)
    setSessionFilterMode('custom')
    setIsGlobalSrsSession(isCrossDeck)
    setSessionWords(targetList)
    setSessionSeq((s) => s + 1)
    setActiveStudyMode(mode)
  }

  const handleSwitchStudyMode = (nextMode: StudyMode, targetWords: WordItem[]) => {
    if (targetWords.length === 0) return
    audioService.stopSpeech()
    refreshData()
    const nextBatch = storageService.prepareStudyBatch(targetWords, sessionFilterMode)
    setSessionWords(nextBatch)
    setSessionSeq((s) => s + 1)
    setActiveStudyMode(nextMode)
  }

  const handleExitStudy = () => {
    audioService.stopSpeech()
    setActiveStudyMode(null)
    setCustomSessionLabel(null)
    setSessionFilterMode('all')
    setIsGlobalSrsSession(false)
    refreshData()
  }

  const handleExitGame = () => {
    audioService.stopSpeech()
    setActiveGame(null)
    refreshData()
  }

  const handleStudyMissedFromGame = (missed: WordItem[]) => {
    audioService.stopSpeech()
    setActiveGame(null)
    refreshData()
    handleStartCustomSession(missed, 'smart-mix', 'Ôn từ vừa sai (Đấu Trường)', true)
  }

  const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0] || null
  const studyDeckId = isGlobalSrsSession ? GLOBAL_SRS_DECK_ID : activeDeck?.id || ''
  const studyDeckName =
    customSessionLabel ||
    (isGlobalSrsSession ? 'Ôn tập SRS Toàn kho' : activeDeck?.name || 'Kho từ vựng')
  const studyPoolWords = isGlobalSrsSession ? allWords : words
  const isFullScreenSession = Boolean(activeStudyMode || activeGame)
  const globalDueCount = storageService.getDueReviewWords().length

  useEffect(() => {
    if (isFullScreenSession || isCloudModalOpen || isStatsModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (!isTyping && e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        audioService.playClick()
        setIsStatsModalOpen(true)
        return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const tabMap: Record<string, ActiveTab> = {
        '1': 'practice',
        '2': 'games',
        '3': 'add',
        '4': 'library',
      }
      const nextTab = tabMap[e.key]
      if (nextTab) {
        e.preventDefault()
        audioService.playClick()
        setActiveTab(nextTab)
        refreshData()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullScreenSession, isCloudModalOpen, isStatsModalOpen, refreshData])

  const starredAllWords = allWords.filter((w) => Boolean(w.starred))
  const learningAllWords = allWords.filter((w) => w.status === 'learning')
  const effectiveArcadePoolId =
    arcadePoolId === ALL_DECKS_ID
      ? ALL_DECKS_ID
      : arcadePoolId === STARRED_POOL_ID && starredAllWords.length > 0
      ? STARRED_POOL_ID
      : arcadePoolId === LEARNING_POOL_ID && learningAllWords.length > 0
      ? LEARNING_POOL_ID
      : ''

  const arcadeWords =
    effectiveArcadePoolId === ALL_DECKS_ID
      ? allWords
      : effectiveArcadePoolId === STARRED_POOL_ID
      ? starredAllWords
      : effectiveArcadePoolId === LEARNING_POOL_ID
      ? learningAllWords
      : words

  const arcadeDeckLabel =
    effectiveArcadePoolId === ALL_DECKS_ID
      ? 'Tất cả kho từ'
      : effectiveArcadePoolId === STARRED_POOL_ID
      ? 'Từ đã đánh dấu sao'
      : effectiveArcadePoolId === LEARNING_POOL_ID
      ? 'Từ khó đang ôn'
      : activeDeck?.name || 'Kho từ vựng'

  return (
    <ErrorBoundary>
      <PullToRefresh>
        <div className="w-full min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors">
          {/* Top Header */}
          <Navbar
            activeDeck={activeDeck}
            streak={streak}
            onGoHome={() => {
              audioService.stopSpeech()
              setActiveStudyMode(null)
              setActiveGame(null)
              setActiveTab('practice')
              refreshData()
            }}
            onOpenDeckSelector={() => {
              audioService.stopSpeech()
              setActiveStudyMode(null)
              setActiveGame(null)
              setActiveTab('library')
            }}
            onOpenCloudSync={() => setIsCloudModalOpen(true)}
            onOpenStats={() => setIsStatsModalOpen(true)}
          />

          {/* Magic QR Link Restore Toast */}
          {syncToast && (
            <div className="w-full max-w-md sm:max-w-xl mx-auto px-3.5 pt-2.5 animate-fadeIn">
              <div
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 shadow-sm ${
                  syncToast.ok
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {syncToast.ok ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{syncToast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncToast(null)}
                  className="p-1 opacity-70 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Main Content Area (Safe-area aware for notched & home-indicator phones) */}
          <main
            className={`w-full flex-1 flex flex-col ${
              isFullScreenSession
                ? 'pb-[max(0.625rem,env(safe-area-inset-bottom,0px))]'
                : 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]'
            }`}
          >
            <Suspense fallback={<ViewLoader />}>
              {/* Active Study Mode Screens */}
              {activeStudyMode === 'flashcard' && activeDeck && (
                <FlashcardView
                  key={`fc-${sessionSeq}`}
                  words={sessionWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'quiz' && activeDeck && (
                <QuizView
                  key={`qz-${sessionSeq}`}
                  words={sessionWords}
                  allDeckWords={studyPoolWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'spelling' && activeDeck && (
                <SpellingView
                  key={`sp-${sessionSeq}`}
                  words={sessionWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'listening' && activeDeck && (
                <ListeningView
                  key={`ls-${sessionSeq}`}
                  words={sessionWords}
                  allDeckWords={studyPoolWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'cloze' && activeDeck && (
                <ClozeView
                  key={`cl-${sessionSeq}`}
                  words={sessionWords}
                  allDeckWords={studyPoolWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'smart-mix' && activeDeck && (
                <SmartMixView
                  key={`sm-${sessionSeq}`}
                  words={sessionWords}
                  allDeckWords={studyPoolWords}
                  deckId={studyDeckId}
                  deckName={studyDeckName}
                  filterMode={sessionFilterMode}
                  onSwitchStudyMode={handleSwitchStudyMode}
                  onBack={handleExitStudy}
                />
              )}

              {/* Active Arcade Mini-Game Screens */}
              {activeGame && isSeedLoading && allWords.length === 0 && <ViewLoader />}

              {activeGame === 'sky-defender' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <SkyDefenderGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onStudyMissedWords={handleStudyMissedFromGame}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'speed-match' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <SpeedMatchGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onStudyMissedWords={handleStudyMissedFromGame}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'blitz-2s' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <BlitzGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onStudyMissedWords={handleStudyMissedFromGame}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'word-bomb' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <WordBombGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onStudyMissedWords={handleStudyMissedFromGame}
                  onBack={handleExitGame}
                />
              )}

              {/* Tab Views */}
              {!isFullScreenSession && activeDeck && (
                <>
                  {activeTab === 'practice' && (
                    <PracticeHome
                      decks={decks}
                      activeDeck={activeDeck}
                      words={words}
                      allWords={allWords}
                      isSeedLoading={isSeedLoading}
                      dailyProgress={dailyProgress}
                      shuffleEnabled={studyPrefs.shuffle}
                      batchSize={studyPrefs.batchSize}
                      onToggleShuffle={handleToggleShuffle}
                      onChangeBatchSize={handleChangeBatchSize}
                      onChangeDailyGoal={handleChangeDailyGoal}
                      onSelectDeck={handleSelectDeck}
                      onResetDeck={handleResetDeck}
                      onStartMode={handleStartMode}
                      onGoToAddWord={() => setActiveTab('add')}
                      onGoToLibrary={() => setActiveTab('library')}
                    />
                  )}

                  {activeTab === 'games' && (
                    <ArcadeHub
                      decks={decks}
                      selectedDeckId={effectiveArcadePoolId || activeDeck.id}
                      words={arcadeWords}
                      allWords={allWords}
                      highScores={highScores}
                      onSelectArcadeDeck={handleSelectArcadeDeck}
                      onStartGame={(gameId) => setActiveGame(gameId)}
                      onOpenCloudSync={() => setIsCloudModalOpen(true)}
                    />
                  )}

                  {activeTab === 'add' && (
                    <AddWordView
                      key={activeDeck.id}
                      decks={decks}
                      activeDeckId={activeDeck.id}
                      onWordAdded={(addedDeckId) => {
                        handleSelectDeck(addedDeckId)
                        refreshData()
                      }}
                      onGoToPractice={(targetDeckId) => {
                        handleSelectDeck(targetDeckId)
                        refreshData()
                        setActiveTab('practice')
                      }}
                    />
                  )}

                  {activeTab === 'library' && (
                    <LibraryView
                      decks={decks}
                      activeDeck={activeDeck}
                      words={words}
                      allWords={allWords}
                      onSelectDeck={handleSelectDeck}
                      onDataChanged={refreshData}
                      onGoToAddWord={() => setActiveTab('add')}
                      onStartFilteredStudy={handleStartCustomSession}
                    />
                  )}
                </>
              )}
            </Suspense>
          </main>

          {/* Cloud Sync & Recovery ID Modal */}
          {isCloudModalOpen && (
            <Suspense fallback={null}>
              <CloudSyncModal
                isOpen={isCloudModalOpen}
                onClose={() => setIsCloudModalOpen(false)}
                onDataRestored={() => {
                  refreshData()
                }}
              />
            </Suspense>
          )}

          {/* Learning Statistics & Achievement Badges Modal */}
          {isStatsModalOpen && (
            <Suspense fallback={null}>
              <StatsModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                decks={decks}
                allWords={allWords}
                streak={streak}
                highScores={highScores}
                onJumpToDeck={(targetDeckId) => {
                  handleSelectDeck(targetDeckId)
                  setActiveTab('practice')
                  refreshData()
                }}
                onStartGlobalWeakReview={(mode) => {
                  setIsStatsModalOpen(false)
                  setActiveTab('practice')
                  handleStartMode(mode, 'global-learning')
                }}
                onStartGlobalStarredReview={(mode) => {
                  setIsStatsModalOpen(false)
                  setActiveTab('practice')
                  const starredPool = storageService.getWords().filter((w) => Boolean(w.starred))
                  handleStartCustomSession(starredPool, mode, '⭐ Đã lưu sao Toàn kho', true)
                }}
                onStartGlobalDueReview={(mode) => {
                  setIsStatsModalOpen(false)
                  setActiveTab('practice')
                  handleStartMode(mode, 'global-due')
                }}
              />
            </Suspense>
          )}

          {/* Bottom Navigation */}
          {!isFullScreenSession && (
            <BottomNav
              currentTab={activeTab}
              dueCount={globalDueCount}
              onTabChange={(tab) => {
                setActiveTab(tab)
                refreshData()
              }}
            />
          )}
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  )
}

export default App
