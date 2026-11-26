export type StudyMode = 'flashcard' | 'quiz' | 'spelling' | 'listening' | 'cloze'

export type ArcadeGameId = 'sky-defender' | 'speed-match' | 'blitz-2s' | 'word-bomb'

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
  srsLevel?: number
  nextReview?: number
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

export interface BuiltInWordProgress {
  s: StudyStatus
  r: number
  t?: number
  l?: number
  n?: number
}

export interface LeaderboardEntry {
  player_tag: string
  nickname: string
  sky_score: number
  match_score: number
  blitz_score: number
  bomb_score?: number
  total_score: number
  mastered_count: number
  updated_at: string
}

export interface CommunityDeckWord {
  term: string
  ipa?: string
  definition: string
  example?: string
  partOfSpeech?: string
}

export interface CommunityDeck {
  id: string
  author_tag: string
  author_name: string
  name: string
  description: string
  words: CommunityDeckWord[]
  word_count: number
  updated_at: string
}
