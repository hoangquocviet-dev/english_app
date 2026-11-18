import { type ComponentType, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { PullToRefresh } from './components/common/PullToRefresh'
import { ALL_DECKS_ID, ArcadeHub } from './components/games/ArcadeHub'
import { PracticeHome } from './components/practice/PracticeHome'
import type { ActiveTab, ArcadeGameId, Deck, StudyMode, WordItem } from './types'
import { audioService } from './utils/audio'
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
const SkyDefenderGame = lazyWithRetry(() =>
  import('./components/games/SkyDefenderGame').then((m) => ({ default: m.SkyDefenderGame }))
)
const SpeedMatchGame = lazyWithRetry(() =>
  import('./components/games/SpeedMatchGame').then((m) => ({ default: m.SpeedMatchGame }))
)
const BlitzGame = lazyWithRetry(() =>
  import('./components/games/BlitzGame').then((m) => ({ default: m.BlitzGame }))
)
const AddWordView = lazyWithRetry(() =>
  import('./components/add/AddWordView').then((m) => ({ default: m.AddWordView }))
)
const LibraryView = lazyWithRetry(() =>
  import('./components/library/LibraryView').then((m) => ({ default: m.LibraryView }))
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
    const loadedWords = storageService.getWords(currentActiveDeckId)

    setDecks(loadedDecks)
    setActiveDeckId(currentActiveDeckId)
    setWords(loadedWords)
    setAllWords(storageService.getWords())
    setStreak(storageService.getStudyStreak())
    setDailyProgress(storageService.getDailyProgress())
    setHighScores(storageService.getHighScores())
  }, [])

  // Lazy non-blocking background hydration for 1,000+ built-in vocabulary words
  useEffect(() => {
    let active = true
    void storageService.ensureSeedLoaded().then((changed) => {
      if (!active) return
      if (changed) {
        refreshData()
      }
      setIsSeedLoading(false)
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

  const handleStartMode = (mode: StudyMode) => {
    const freshWords = storageService.getWords(activeDeckId)
    let targetList = freshWords.filter((w) => w.status !== 'mastered')
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
          />

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

              {/* Tab Views */}
              {!isFullScreenSession && activeDeck && (
                <>
                  {activeTab === 'practice' && (
                    <PracticeHome
                      decks={decks}
                      activeDeck={activeDeck}
                      words={words}
                      isSeedLoading={isSeedLoading}
                      dailyProgress={dailyProgress}
                      shuffleEnabled={studyPrefs.shuffle}
                      batchSize={studyPrefs.batchSize}
                      onToggleShuffle={handleToggleShuffle}
                      onChangeBatchSize={handleChangeBatchSize}
                      onSelectDeck={handleSelectDeck}
                      onResetDeck={handleResetDeck}
                      onStartMode={handleStartMode}
                      onGoToAddWord={() => setActiveTab('add')}
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
