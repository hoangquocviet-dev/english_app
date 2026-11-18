export type StudyMode = 'flashcard' | 'quiz' | 'spelling' | 'listening'

export type ArcadeGameId = 'sky-defender' | 'speed-match' | 'blitz-2s'

export type GameHighScores = Record<ArcadeGameId, number>

export type ActiveTab = 'practice' | 'games' | 'add' | 'library'

export type StudyStatus = 'new' | 'learning' | 'mastered'

export interface WordItem {
  id: string
  deckId: string
  term: string
  ipa?: string
  definition: string
  example?: string
  partOfSpeech?: string
  audioUrl?: string
  status: StudyStatus
  reviewCount: number
  lastReviewed?: number
}

export interface Deck {
  id: string
  name: string
  description?: string
  isBuiltIn: boolean
  createdAt: number
}

export interface StudySessionStats {
  totalWords: number
  masteredCount: number
  reviewCount: number
  mode: StudyMode
  deckName: string
  remainingWords?: WordItem[]
}

export interface SpellingTile {
  tileId: string
  letter: string
  originalIndex: number
}

export interface ImportResult {
  added: number
  skipped: number
  errors: string[]
  deckId: string
  deckName: string
}
