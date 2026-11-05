import { INITIAL_DECKS, INITIAL_WORDS } from '../data/initialDecks'
import type { Deck, WordItem } from '../types'

const STORAGE_KEYS = {
  DECKS: 'vocabflow_decks',
  WORDS: 'vocabflow_words',
  ACTIVE_DECK: 'vocabflow_active_deck',
  LAST_ACTIVE_DATE: 'vocabflow_last_date',
  STREAK: 'vocabflow_streak',
  BACKUP: 'vocabflow_backup_corrupted',
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
      // Cannot delete built-in deck
      return false
    }
    const updatedDecks = decks.filter((d) => d.id !== deckId)
    this.set(STORAGE_KEYS.DECKS, updatedDecks)

    // Remove all associated words
    const words = this.getWords()
    const updatedWords = words.filter((w) => w.deckId !== deckId)
    this.set(STORAGE_KEYS.WORDS, updatedWords)

    // Reset active deck if it was the deleted one
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
    if (!words || words.length === 0) {
      this.set(STORAGE_KEYS.WORDS, INITIAL_WORDS)
      return deckId ? INITIAL_WORDS.filter((w) => w.deckId === deckId) : INITIAL_WORDS
    }

    // Ensure newly added built-in words are merged into existing local storage
    const missingBuiltIns = INITIAL_WORDS.filter(
      (initW) => !words.some((w) => w.id === initW.id)
    )
    let currentWords = words
    if (missingBuiltIns.length > 0) {
      currentWords = [...words, ...missingBuiltIns]
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
    const updated = words.filter((w) => w.id !== id)
    this.set(STORAGE_KEYS.WORDS, updated)
  }

  public updateWordStatus(id: string, status: WordItem['status']): void {
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
    this.recordDailyActivity()
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

  // STREAK & ACTIVITY (4 AM reset boundary)
  public getStudyStreak(): number {
    return this.get<number>(STORAGE_KEYS.STREAK, 1)
  }

  public recordDailyActivity(): void {
    const now = new Date()
    // Adjust by 4 hours backwards so that midnight to 4:00 AM counts as the previous calendar day
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const todayKey = `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`

    const lastActive = this.get<string>(STORAGE_KEYS.LAST_ACTIVE_DATE, '')
    let streak = this.get<number>(STORAGE_KEYS.STREAK, 1)

    if (!lastActive) {
      this.set(STORAGE_KEYS.LAST_ACTIVE_DATE, todayKey)
      this.set(STORAGE_KEYS.STREAK, 1)
      return
    }

    if (lastActive === todayKey) {
      // Already recorded today
      return
    }

    // Check if last active was yesterday
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

  // RESET TO FACTORY DEFAULTS
  public resetToDefaults(): void {
    if (!this.isLocalStorageAvailable()) return
    this.set(STORAGE_KEYS.DECKS, INITIAL_DECKS)
    this.set(STORAGE_KEYS.WORDS, INITIAL_WORDS)
    this.set(STORAGE_KEYS.ACTIVE_DECK, INITIAL_DECKS[0].id)
  }
}

export const storageService = new SafeStorageService()
