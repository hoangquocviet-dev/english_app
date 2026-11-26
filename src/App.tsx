import { Check, AlertCircle, X } from 'lucide-react'
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { PullToRefresh } from './components/common/PullToRefresh'
import { ALL_DECKS_ID, ArcadeHub } from './components/games/ArcadeHub'
import { PracticeHome } from './components/practice/PracticeHome'
import type { ActiveTab, ArcadeGameId, Deck, StudyMode, WordItem } from './types'
import { audioService } from './utils/audio'
import { cloudSyncService } from './utils/cloudSync'
import { forceReloadApp } from './utils/reload'
import { storageService } from './utils/storage'

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

function shuffleWords(list: WordItem[]): WordItem[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
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
  const [arcadeUseAllDecks, setArcadeUseAllDecks] = useState<boolean>(false)
  const [sessionWords, setSessionWords] = useState<WordItem[]>([])
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false)
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

        const magicOutcome = await cloudSyncService.init(() => {
          if (active) refreshData()
        })
        if (active && magicOutcome) {
          setSyncToast({ ok: magicOutcome.ok, message: magicOutcome.message })
          window.setTimeout(() => {
            if (active) setSyncToast(null)
          }, 5500)
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
    if (deckId === ALL_DECKS_ID) {
      setArcadeUseAllDecks(true)
      setAllWords(storageService.getWords())
    } else {
      setArcadeUseAllDecks(false)
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
    filterMode: 'all' | 'learning' | 'due' = 'all'
  ) => {
    const freshWords = storageService.getWords(activeDeckId)
    const now = Date.now()
    let targetList: WordItem[]

    if (filterMode === 'due') {
      targetList = freshWords.filter(
        (w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= now)
      )
    } else if (filterMode === 'learning') {
      targetList = freshWords.filter((w) => w.status === 'learning')
    } else {
      targetList = freshWords.filter((w) => w.status !== 'mastered')
    }

    if (targetList.length === 0) return

    if (studyPrefs.shuffle) {
      targetList = shuffleWords(targetList)
    }
    if (studyPrefs.batchSize > 0 && targetList.length > studyPrefs.batchSize) {
      targetList = targetList.slice(0, studyPrefs.batchSize)
    }

    setSessionWords(targetList)
    setActiveStudyMode(mode)
  }

  const handleExitStudy = () => {
    audioService.stopSpeech()
    setActiveStudyMode(null)
    refreshData()
  }

  const handleExitGame = () => {
    audioService.stopSpeech()
    setActiveGame(null)
    refreshData()
  }

  const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0] || null
  const isFullScreenSession = Boolean(activeStudyMode || activeGame)
  const arcadeWords = arcadeUseAllDecks ? allWords : words
  const arcadeDeckLabel = arcadeUseAllDecks
    ? 'Tất cả kho từ'
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
          />

          {/* Magic QR Link Restore Toast */}
          {syncToast && (
            <div className="w-full max-w-md mx-auto px-3.5 pt-2.5 animate-fadeIn">
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

          {/* Main Content Area */}
          <main className={`w-full flex-1 flex flex-col ${isFullScreenSession ? 'pb-2' : 'pb-20'}`}>
            <Suspense fallback={<ViewLoader />}>
              {/* Active Study Mode Screens */}
              {activeStudyMode === 'flashcard' && activeDeck && (
                <FlashcardView
                  words={sessionWords}
                  deckId={activeDeck.id}
                  deckName={activeDeck.name}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'quiz' && activeDeck && (
                <QuizView
                  words={sessionWords}
                  allDeckWords={words}
                  deckId={activeDeck.id}
                  deckName={activeDeck.name}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'spelling' && activeDeck && (
                <SpellingView
                  words={sessionWords}
                  deckId={activeDeck.id}
                  deckName={activeDeck.name}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'listening' && activeDeck && (
                <ListeningView
                  words={sessionWords}
                  allDeckWords={words}
                  deckId={activeDeck.id}
                  deckName={activeDeck.name}
                  onBack={handleExitStudy}
                />
              )}

              {activeStudyMode === 'cloze' && activeDeck && (
                <ClozeView
                  words={sessionWords}
                  allDeckWords={words}
                  deckId={activeDeck.id}
                  deckName={activeDeck.name}
                  onBack={handleExitStudy}
                />
              )}

              {/* Active Arcade Mini-Game Screens */}
              {activeGame && isSeedLoading && allWords.length === 0 && <ViewLoader />}

              {activeGame === 'sky-defender' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <SkyDefenderGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'speed-match' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <SpeedMatchGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'blitz-2s' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <BlitzGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'word-bomb' && activeDeck && (!isSeedLoading || allWords.length > 0) && (
                <WordBombGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
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
                      selectedDeckId={arcadeUseAllDecks ? ALL_DECKS_ID : activeDeck.id}
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

          {/* Bottom Navigation */}
          {!isFullScreenSession && (
            <BottomNav
              currentTab={activeTab}
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
