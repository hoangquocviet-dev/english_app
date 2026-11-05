import { useCallback, useEffect, useState } from 'react'
import { AddWordView } from './components/add/AddWordView'
import { BottomNav } from './components/common/BottomNav'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Navbar } from './components/common/Navbar'
import { LibraryView } from './components/library/LibraryView'
import { FlashcardView } from './components/practice/FlashcardView'
import { PracticeHome } from './components/practice/PracticeHome'
import { QuizView } from './components/practice/QuizView'
import { SpellingView } from './components/practice/SpellingView'
import type { ActiveTab, Deck, StudyMode, WordItem } from './types'
import { storageService } from './utils/storage'

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('practice')
  const [activeStudyMode, setActiveStudyMode] = useState<StudyMode | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [activeDeckId, setActiveDeckId] = useState<string>('')
  const [words, setWords] = useState<WordItem[]>([])

  // Load decks and words
  const refreshData = useCallback(() => {
    const loadedDecks = storageService.getDecks()
    const currentActiveDeckId = storageService.getActiveDeckId()
    const loadedWords = storageService.getWords(currentActiveDeckId)

    setDecks(loadedDecks)
    setActiveDeckId(currentActiveDeckId)
    setWords(loadedWords)
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const handleSelectDeck = (deckId: string) => {
    storageService.setActiveDeckId(deckId)
    setActiveDeckId(deckId)
    setWords(storageService.getWords(deckId))
  }

  const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0] || null

  return (
    <ErrorBoundary>
      <div className="min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors">
        {/* Top Header */}
        <Navbar
          activeDeck={activeDeck}
          onOpenDeckSelector={() => {
            setActiveStudyMode(null)
            setActiveTab('library')
          }}
        />

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col ${activeStudyMode ? 'pb-4' : 'pb-20'}`}>
          {/* Active Study Mode Screens */}
          {activeStudyMode === 'flashcard' && activeDeck && (
            <FlashcardView
              words={words}
              deckName={activeDeck.name}
              onBack={() => {
                setActiveStudyMode(null)
                refreshData()
              }}
            />
          )}

          {activeStudyMode === 'quiz' && activeDeck && (
            <QuizView
              words={words}
              deckName={activeDeck.name}
              onBack={() => {
                setActiveStudyMode(null)
                refreshData()
              }}
            />
          )}

          {activeStudyMode === 'spelling' && activeDeck && (
            <SpellingView
              words={words}
              deckName={activeDeck.name}
              onBack={() => {
                setActiveStudyMode(null)
                refreshData()
              }}
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
                  onSelectDeck={handleSelectDeck}
                  onStartMode={(mode) => setActiveStudyMode(mode)}
                  onGoToAddWord={() => setActiveTab('add')}
                />
              )}

              {activeTab === 'add' && (
                <AddWordView
                  decks={decks}
                  activeDeckId={activeDeck.id}
                  onWordAdded={() => {
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
    </ErrorBoundary>
  )
}

export default App
