import { useCallback, useState } from 'react'
import { AddWordView } from './components/add/AddWordView'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { PullToRefresh } from './components/common/PullToRefresh'
import { LibraryView } from './components/library/LibraryView'
import { FlashcardView } from './components/practice/FlashcardView'
import { ListeningView } from './components/practice/ListeningView'
import { PracticeHome } from './components/practice/PracticeHome'
import { QuizView } from './components/practice/QuizView'
import { SpellingView } from './components/practice/SpellingView'
import type { ActiveTab, Deck, StudyFilter, StudyMode, WordItem } from './types'
import { audioService } from './utils/audio'
import { storageService } from './utils/storage'

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

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('practice')
  const [activeStudyMode, setActiveStudyMode] = useState<StudyMode | null>(null)
  const [sessionWords, setSessionWords] = useState<WordItem[]>([])

  const [decks, setDecks] = useState<Deck[]>(() => storageService.getDecks())
  const [activeDeckId, setActiveDeckId] = useState<string>(() => storageService.getActiveDeckId())
  const [words, setWords] = useState<WordItem[]>(() =>
    storageService.getWords(storageService.getActiveDeckId())
  )
  const [streak, setStreak] = useState<number>(() => storageService.getStudyStreak())
  const [dailyProgress, setDailyProgress] = useState(() => storageService.getDailyProgress())
  const [studyPrefs, setStudyPrefs] = useState(() => storageService.getStudyPreferences())

  const refreshData = useCallback(() => {
    const loadedDecks = storageService.getDecks()
    const currentActiveDeckId = storageService.getActiveDeckId()
    const loadedWords = storageService.getWords(currentActiveDeckId)

    setDecks(loadedDecks)
    setActiveDeckId(currentActiveDeckId)
    setWords(loadedWords)
    setStreak(storageService.getStudyStreak())
    setDailyProgress(storageService.getDailyProgress())
  }, [])

  const handleSelectDeck = (deckId: string) => {
    storageService.setActiveDeckId(deckId)
    setActiveDeckId(deckId)
    setWords(storageService.getWords(deckId))
  }

  const handleChangeFilter = (filter: StudyFilter) => {
    const next = { ...studyPrefs, filter }
    setStudyPrefs(next)
    storageService.setStudyPreferences(next)
  }

  const handleToggleShuffle = () => {
    const next = { ...studyPrefs, shuffle: !studyPrefs.shuffle }
    setStudyPrefs(next)
    storageService.setStudyPreferences(next)
  }

  const handleStartMode = (mode: StudyMode) => {
    let targetList = words
    if (studyPrefs.filter === 'unmastered') {
      const unmastered = words.filter((w) => w.status !== 'mastered')
      if (unmastered.length > 0) {
        targetList = unmastered
      }
    }

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

  const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0] || null

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
              setActiveTab('practice')
              refreshData()
            }}
            onOpenDeckSelector={() => {
              audioService.stopSpeech()
              setActiveStudyMode(null)
              setActiveTab('library')
            }}
          />

          {/* Main Content Area */}
          <main className={`w-full flex-1 flex flex-col ${activeStudyMode ? 'pb-4' : 'pb-20'}`}>
            {/* Active Study Mode Screens */}
            {activeStudyMode === 'flashcard' && activeDeck && (
              <FlashcardView
                words={sessionWords}
                deckName={activeDeck.name}
                onBack={handleExitStudy}
              />
            )}

            {activeStudyMode === 'quiz' && activeDeck && (
              <QuizView
                words={sessionWords}
                deckName={activeDeck.name}
                onBack={handleExitStudy}
              />
            )}

            {activeStudyMode === 'spelling' && activeDeck && (
              <SpellingView
                words={sessionWords}
                deckName={activeDeck.name}
                onBack={handleExitStudy}
              />
            )}

            {activeStudyMode === 'listening' && activeDeck && (
              <ListeningView
                words={sessionWords}
                deckName={activeDeck.name}
                onBack={handleExitStudy}
              />
            )}

            {/* Tab Views */}
            {!activeStudyMode && activeDeck && (
              <>
                {activeTab === 'practice' && (
                  <PracticeHome
                    decks={decks}
                    activeDeck={activeDeck}
                    words={words}
                    dailyProgress={dailyProgress}
                    studyFilter={studyPrefs.filter}
                    shuffleEnabled={studyPrefs.shuffle}
                    onChangeFilter={handleChangeFilter}
                    onToggleShuffle={handleToggleShuffle}
                    onSelectDeck={handleSelectDeck}
                    onStartMode={handleStartMode}
                    onGoToAddWord={() => setActiveTab('add')}
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
          </main>

          {/* Bottom Navigation */}
          {!activeStudyMode && (
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
