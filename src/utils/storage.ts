import { INITIAL_DECKS, INITIAL_WORDS } from '../data/initialDecks'
import type { ArcadeGameId, Deck, GameHighScores, WordItem } from '../types'

const CURRENT_SEED_VERSION = 3

const STORAGE_KEYS = {
  DECKS: 'vocabflow_decks',
  WORDS: 'vocabflow_words',
  ACTIVE_DECK: 'vocabflow_active_deck',
  LAST_ACTIVE_DATE: 'vocabflow_last_date',
  STREAK: 'vocabflow_streak',
  DAILY_PROGRESS: 'vocabflow_daily_progress',
  STUDY_PREFS: 'vocabflow_study_prefs',
  HIGH_SCORES: 'vocabflow_high_scores',
  DELETED_BUILTINS: 'vocabflow_deleted_builtins',
  SEED_VERSION: 'vocabflow_seed_version',
  BACKUP: 'vocabflow_backup_corrupted',
}

export interface DailyProgress {
  dateKey: string
  count: number
  goal: number
}

export interface StudyPreferences {
  shuffle: boolean
}

class SafeStorageService {
  private isLocalStorageAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false
      const testKey = '__storage_test__'
      window.localStorage.setItem(testKey, testKey)
      window.localStorage.removeItem(testKey)
      return true
    } catch {
      return false
    }
  }

  private getTodayKey(): string {
    const now = new Date()
    // Adjust by 4 hours backwards so midnight to 4:00 AM counts as previous study day
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    return `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`
  }

  // Generic safe get
  private get<T>(key: string, fallback: T): T {
    if (!this.isLocalStorageAvailable()) return fallback
    try {
      const item = window.localStorage.getItem(key)
      if (!item) return fallback
      return JSON.parse(item) as T
    } catch (e) {
      console.warn(`[Storage] Failed to parse key: ${key}. Backing up and falling back.`, e)
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          window.localStorage.setItem(`${STORAGE_KEYS.BACKUP}_${Date.now()}`, raw)
        }
      } catch {}
      return fallback
    }
  }

  // Generic safe set
  private set<T>(key: string, value: T): boolean {
    if (!this.isLocalStorageAvailable()) return false
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      console.error(`[Storage] Failed to save key: ${key}`, e)
      return false
    }
  }

  // DECKS CRUD
  public getDecks(): Deck[] {
    const decks = this.get<Deck[]>(STORAGE_KEYS.DECKS, [])
    if (!decks || decks.length === 0) {
      this.set(STORAGE_KEYS.DECKS, INITIAL_DECKS)
      return INITIAL_DECKS
    }
    // Ensure built-in decks are always included
    const missingBuiltIns = INITIAL_DECKS.filter(
      (initD) => !decks.some((d) => d.id === initD.id)
    )
    if (missingBuiltIns.length > 0) {
      const merged = [...INITIAL_DECKS, ...decks.filter((d) => !d.isBuiltIn)]
      this.set(STORAGE_KEYS.DECKS, merged)
      return merged
    }
    return decks
  }

  public createDeck(name: string, description?: string): Deck {
    const decks = this.getDecks()
    const newDeck: Deck = {
      id: `deck-${Date.now()}`,
      name: name.trim(),
      description: description?.trim() || undefined,
      isBuiltIn: false,
      createdAt: Date.now(),
    }
    this.set(STORAGE_KEYS.DECKS, [...decks, newDeck])
    return newDeck
  }

  public deleteDeck(deckId: string): boolean {
    const decks = this.getDecks()
    const target = decks.find((d) => d.id === deckId)
    if (!target || target.isBuiltIn) {
      return false
    }
    const updatedDecks = decks.filter((d) => d.id !== deckId)
    this.set(STORAGE_KEYS.DECKS, updatedDecks)

    const words = this.getWords()
    const updatedWords = words.filter((w) => w.deckId !== deckId)
    this.set(STORAGE_KEYS.WORDS, updatedWords)

    const activeDeckId = this.getActiveDeckId()
    if (activeDeckId === deckId) {
      this.setActiveDeckId(INITIAL_DECKS[0].id)
    }
    return true
  }

  public getActiveDeckId(): string {
    const active = this.get<string>(STORAGE_KEYS.ACTIVE_DECK, '')
    const decks = this.getDecks()
    if (active && decks.some((d) => d.id === active)) {
      return active
    }
    const defaultId = decks[0]?.id || INITIAL_DECKS[0].id
    this.setActiveDeckId(defaultId)
    return defaultId
  }

  public setActiveDeckId(deckId: string): void {
    this.set(STORAGE_KEYS.ACTIVE_DECK, deckId)
  }

  // WORDS CRUD
  public getWords(deckId?: string): WordItem[] {
    const words = this.get<WordItem[]>(STORAGE_KEYS.WORDS, [])
    const deletedBuiltIns = new Set(this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, []))
    const savedSeedVersion = this.get<number>(STORAGE_KEYS.SEED_VERSION, 0)

    if (!words || words.length === 0) {
      this.set(STORAGE_KEYS.WORDS, INITIAL_WORDS)
      this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
      return deckId ? INITIAL_WORDS.filter((w) => w.deckId === deckId) : INITIAL_WORDS
    }

    let currentWords = words
    let hasChanges = false

    // Merge newly added built-in words (respecting user deletions)
    const missingBuiltIns = INITIAL_WORDS.filter(
      (initW) => !deletedBuiltIns.has(initW.id) && !words.some((w) => w.id === initW.id)
    )

    if (missingBuiltIns.length > 0) {
      currentWords = [...words, ...missingBuiltIns]
      hasChanges = true
    }

    // Only run built-in metadata sync once per seed version bump so user edits are preserved
    if (savedSeedVersion < CURRENT_SEED_VERSION) {
      currentWords = currentWords.map((w) => {
        const builtIn = INITIAL_WORDS.find((initW) => initW.id === w.id)
        if (
          builtIn &&
          (builtIn.ipa !== w.ipa ||
            builtIn.definition !== w.definition ||
            builtIn.term !== w.term)
        ) {
          hasChanges = true
          return { ...builtIn, status: w.status, reviewCount: w.reviewCount, lastReviewed: w.lastReviewed }
        }
        return w
      })
      this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
    }

    if (hasChanges) {
      this.set(STORAGE_KEYS.WORDS, currentWords)
    }

    if (deckId) {
      return currentWords.filter((w) => w.deckId === deckId)
    }
    return currentWords
  }

  public addWord(word: Omit<WordItem, 'id' | 'status' | 'reviewCount'>): WordItem {
    const words = this.getWords()
    const newWord: WordItem = {
      ...word,
      id: `w-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: 'new',
      reviewCount: 0,
    }
    this.set(STORAGE_KEYS.WORDS, [newWord, ...words])
    return newWord
  }

  public updateWord(updatedWord: WordItem): void {
    const words = this.getWords()
    const updated = words.map((w) => (w.id === updatedWord.id ? updatedWord : w))
    this.set(STORAGE_KEYS.WORDS, updated)
  }

  public deleteWord(id: string): void {
    const words = this.getWords()
    const isBuiltIn = INITIAL_WORDS.some((w) => w.id === id)
    if (isBuiltIn) {
      const deleted = this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, [])
      if (!deleted.includes(id)) {
        this.set(STORAGE_KEYS.DELETED_BUILTINS, [...deleted, id])
      }
    }
    const updated = words.filter((w) => w.id !== id)
    this.set(STORAGE_KEYS.WORDS, updated)
  }

  public updateWordStatus(id: string, status: WordItem['status'], countActivity: boolean = true): void {
    const words = this.getWords()
    const updated = words.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          status,
          reviewCount: status === 'mastered' ? w.reviewCount : w.reviewCount + 1,
          lastReviewed: Date.now(),
        }
      }
      return w
    })
    this.set(STORAGE_KEYS.WORDS, updated)
    if (countActivity) {
      this.recordDailyActivity(true)
    }
  }

  public resetDeckProgress(deckId: string): void {
    // Also restore any deleted built-in words belonging to this deck
    const deckBuiltInIds = new Set(
      INITIAL_WORDS.filter((w) => w.deckId === deckId).map((w) => w.id)
    )
    if (deckBuiltInIds.size > 0) {
      const deleted = this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, [])
      const filteredDeleted = deleted.filter((id) => !deckBuiltInIds.has(id))
      this.set(STORAGE_KEYS.DELETED_BUILTINS, filteredDeleted)
    }

    const words = this.getWords()
    const updated = words.map((w) => {
      if (w.deckId === deckId) {
        return {
          ...w,
          status: 'new' as const,
          reviewCount: 0,
          lastReviewed: undefined,
        }
      }
      return w
    })
    this.set(STORAGE_KEYS.WORDS, updated)
  }

  // IMPORT BULK
  public importWords(
    deckId: string,
    parsedWords: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>>
  ): { added: number; skipped: number } {
    const existingWords = this.getWords(deckId)
    const existingTerms = new Set(existingWords.map((w) => w.term.trim().toLowerCase()))

    const allWords = this.getWords()
    const newWordsList: WordItem[] = []
    let skipped = 0

    for (const pw of parsedWords) {
      const normalizedTerm = pw.term.trim().toLowerCase()
      if (existingTerms.has(normalizedTerm)) {
        skipped++
        continue
      }
      existingTerms.add(normalizedTerm)
      newWordsList.push({
        ...pw,
        id: `w-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        deckId,
        status: 'new',
        reviewCount: 0,
      })
    }

    if (newWordsList.length > 0) {
      this.set(STORAGE_KEYS.WORDS, [...newWordsList, ...allWords])
    }

    return {
      added: newWordsList.length,
      skipped,
    }
  }

  // STUDY PREFERENCES
  public getStudyPreferences(): StudyPreferences {
    return this.get<StudyPreferences>(STORAGE_KEYS.STUDY_PREFS, {
      shuffle: false,
    })
  }

  public setStudyPreferences(prefs: StudyPreferences): void {
    this.set(STORAGE_KEYS.STUDY_PREFS, prefs)
  }

  // DAILY GOAL & STREAK (4 AM reset boundary)
  public getDailyProgress(): DailyProgress {
    const todayKey = this.getTodayKey()
    const saved = this.get<DailyProgress>(STORAGE_KEYS.DAILY_PROGRESS, {
      dateKey: todayKey,
      count: 0,
      goal: 20,
    })
    if (saved.dateKey !== todayKey) {
      return { dateKey: todayKey, count: 0, goal: saved.goal || 20 }
    }
    return saved
  }

  public getStudyStreak(): number {
    return this.get<number>(STORAGE_KEYS.STREAK, 1)
  }

  public recordDailyActivity(incrementWordCount: boolean = true): void {
    const now = new Date()
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const todayKey = `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`

    // Update daily review counter
    if (incrementWordCount) {
      const currentDaily = this.getDailyProgress()
      this.set(STORAGE_KEYS.DAILY_PROGRESS, {
        ...currentDaily,
        dateKey: todayKey,
        count: currentDaily.count + 1,
      })
    }

    const lastActive = this.get<string>(STORAGE_KEYS.LAST_ACTIVE_DATE, '')
    let streak = this.get<number>(STORAGE_KEYS.STREAK, 1)

    if (!lastActive) {
      this.set(STORAGE_KEYS.LAST_ACTIVE_DATE, todayKey)
      this.set(STORAGE_KEYS.STREAK, 1)
      return
    }

    if (lastActive === todayKey) {
      return
    }

    const yesterdayAdjusted = new Date(adjustedTime.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayKey = `${yesterdayAdjusted.getFullYear()}-${yesterdayAdjusted.getMonth() + 1}-${yesterdayAdjusted.getDate()}`

    if (lastActive === yesterdayKey) {
      streak += 1
    } else {
      streak = 1
    }

    this.set(STORAGE_KEYS.LAST_ACTIVE_DATE, todayKey)
    this.set(STORAGE_KEYS.STREAK, streak)
  }

  // ARCADE HIGH SCORES
  public getHighScores(): GameHighScores {
    return this.get<GameHighScores>(STORAGE_KEYS.HIGH_SCORES, {
      'sky-defender': 0,
      'speed-match': 0,
      'blitz-2s': 0,
    })
  }

  public saveHighScore(gameId: ArcadeGameId, score: number): boolean {
    const scores = this.getHighScores()
    const prevBest = scores[gameId] || 0
    if (score > prevBest) {
      this.set(STORAGE_KEYS.HIGH_SCORES, {
        ...scores,
        [gameId]: score,
      })
      return true
    }
    return false
  }

  // RESET TO FACTORY DEFAULTS
  public resetToDefaults(): void {
    if (!this.isLocalStorageAvailable()) return
    this.set(STORAGE_KEYS.DELETED_BUILTINS, [])
    this.set(STORAGE_KEYS.DECKS, INITIAL_DECKS)
    this.set(STORAGE_KEYS.WORDS, INITIAL_WORDS)
    this.set(STORAGE_KEYS.ACTIVE_DECK, INITIAL_DECKS[0].id)
    this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
  }
}

export const storageService = new SafeStorageService()
