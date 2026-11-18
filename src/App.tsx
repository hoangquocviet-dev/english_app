import { lazy, Suspense, useCallback, useState } from 'react'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { PullToRefresh } from './components/common/PullToRefresh'
import { ALL_DECKS_ID, ArcadeHub } from './components/games/ArcadeHub'
import { PracticeHome } from './components/practice/PracticeHome'
import type { ActiveTab, ArcadeGameId, Deck, StudyMode, WordItem } from './types'
import { audioService } from './utils/audio'
import { storageService } from './utils/storage'

const FlashcardView = lazy(() =>
  import('./components/practice/FlashcardView').then((m) => ({ default: m.FlashcardView }))
)
const QuizView = lazy(() =>
  import('./components/practice/QuizView').then((m) => ({ default: m.QuizView }))
)
const SpellingView = lazy(() =>
  import('./components/practice/SpellingView').then((m) => ({ default: m.SpellingView }))
)
const ListeningView = lazy(() =>
  import('./components/practice/ListeningView').then((m) => ({ default: m.ListeningView }))
)
const SkyDefenderGame = lazy(() =>
  import('./components/games/SkyDefenderGame').then((m) => ({ default: m.SkyDefenderGame }))
)
const SpeedMatchGame = lazy(() =>
  import('./components/games/SpeedMatchGame').then((m) => ({ default: m.SpeedMatchGame }))
)
const BlitzGame = lazy(() =>
  import('./components/games/BlitzGame').then((m) => ({ default: m.BlitzGame }))
)
const AddWordView = lazy(() =>
  import('./components/add/AddWordView').then((m) => ({ default: m.AddWordView }))
)
const LibraryView = lazy(() =>
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
    storageService.resetDeckProgress(deckId)
    refreshData()
  }

  const handleToggleShuffle = () => {
    const next = { ...studyPrefs, shuffle: !studyPrefs.shuffle }
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
              {activeGame === 'sky-defender' && activeDeck && (
                <SkyDefenderGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'speed-match' && activeDeck && (
                <SpeedMatchGame
                  words={arcadeWords}
                  deckName={arcadeDeckLabel}
                  onBack={handleExitGame}
                />
              )}

              {activeGame === 'blitz-2s' && activeDeck && (
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
                      dailyProgress={dailyProgress}
                      shuffleEnabled={studyPrefs.shuffle}
                      onToggleShuffle={handleToggleShuffle}
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
                      totalAllWordsCount={allWords.length}
                      highScores={highScores}
                      onSelectArcadeDeck={handleSelectArcadeDeck}
                      onStartGame={(gameId) => setActiveGame(gameId)}
                    />
                  )}

                  {activeTab === 'add' && (
                    <AddWordView
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
