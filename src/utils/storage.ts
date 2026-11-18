import { INITIAL_DECKS } from '../data/deckMeta'
import type { ArcadeGameId, Deck, GameHighScores, WordItem } from '../types'

const CURRENT_SEED_VERSION = 6

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
  batchSize: number // 0 = all cards, >0 = max cards per study session
}

class SafeStorageService {
  // O(1) In-Memory Caches (eliminates repeated JSON.parse on large 1,000-10,000+ word banks)
  private decksCache: Deck[] | null = null
  private wordsCache: WordItem[] | null = null
  private wordsByDeckCache = new Map<string, WordItem[]>()
  private flushTimerId: number | null = null
  private wordsDirty = false
  private seedPromise: Promise<boolean> | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      const flushNow = () => {
        this.flushPendingWrites()
      }
      window.addEventListener('pagehide', flushNow)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushNow()
      })
    }
  }

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
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    return `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`
  }

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

  private commitWordsCache(nextWords: WordItem[], immediate = false): void {
    this.wordsCache = nextWords
    this.wordsByDeckCache.clear()
    this.wordsDirty = true

    if (immediate || typeof window === 'undefined') {
      this.flushPendingWrites()
      return
    }

    if (this.flushTimerId !== null) {
      window.clearTimeout(this.flushTimerId)
    }
    this.flushTimerId = window.setTimeout(() => {
      this.flushTimerId = null
      this.flushPendingWrites()
    }, 60)
  }

  public flushPendingWrites(): void {
    if (!this.wordsDirty || !this.wordsCache) return
    if (this.flushTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.flushTimerId)
      this.flushTimerId = null
    }
    this.wordsDirty = false
    this.set(STORAGE_KEYS.WORDS, this.wordsCache)
  }

  // DECKS CRUD (In-memory cached)
  public getDecks(): Deck[] {
    if (this.decksCache) return this.decksCache

    const decks = this.get<Deck[]>(STORAGE_KEYS.DECKS, [])
    if (!decks || decks.length === 0) {
      this.decksCache = INITIAL_DECKS
      this.set(STORAGE_KEYS.DECKS, INITIAL_DECKS)
      return INITIAL_DECKS
    }

    const existingIds = new Set(decks.map((d) => d.id))
    const missingBuiltIns = INITIAL_DECKS.filter((initD) => !existingIds.has(initD.id))
    if (missingBuiltIns.length > 0) {
      const merged = [...INITIAL_DECKS, ...decks.filter((d) => !d.isBuiltIn)]
      this.decksCache = merged
      this.set(STORAGE_KEYS.DECKS, merged)
      return merged
    }

    this.decksCache = decks
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
    const nextDecks = [...decks, newDeck]
    this.decksCache = nextDecks
    this.set(STORAGE_KEYS.DECKS, nextDecks)
    return newDeck
  }

  public deleteDeck(deckId: string): boolean {
    const decks = this.getDecks()
    const target = decks.find((d) => d.id === deckId)
    if (!target || target.isBuiltIn) {
      return false
    }
    const updatedDecks = decks.filter((d) => d.id !== deckId)
    this.decksCache = updatedDecks
    this.set(STORAGE_KEYS.DECKS, updatedDecks)

    const words = this.getWords()
    const updatedWords = words.filter((w) => w.deckId !== deckId)
    this.commitWordsCache(updatedWords, true)

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

  // LAZY SEED HYDRATION (Zero-KB startup for returning users; non-blocking O(N) sync on seed bump)
  public needsSeedSync(): boolean {
    const words = this.getWords()
    const savedSeedVersion = this.get<number>(STORAGE_KEYS.SEED_VERSION, 0)
    return words.length === 0 || savedSeedVersion < CURRENT_SEED_VERSION
  }

  public ensureSeedLoaded(): Promise<boolean> {
    if (!this.needsSeedSync()) {
      return Promise.resolve(false)
    }
    if (this.seedPromise) return this.seedPromise

    this.seedPromise = (async () => {
      try {
        const { INITIAL_WORDS } = await import('../data/initialDecks')
        const existing = this.getWords()
        const deletedBuiltIns = new Set(this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, []))

        if (existing.length === 0) {
          this.commitWordsCache(INITIAL_WORDS, true)
          this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
          return true
        }

        // O(N) Map/Set merge instead of O(N^2) array scans
        const existingIdSet = new Set(existing.map((w) => w.id))
        const builtInMap = new Map(INITIAL_WORDS.map((w) => [w.id, w]))

        const missingBuiltIns = INITIAL_WORDS.filter(
          (initW) => !deletedBuiltIns.has(initW.id) && !existingIdSet.has(initW.id)
        )

        const syncedExisting = existing.map((w) => {
          const builtIn = builtInMap.get(w.id)
          if (
            builtIn &&
            (builtIn.ipa !== w.ipa ||
              builtIn.definition !== w.definition ||
              builtIn.term !== w.term ||
              builtIn.example !== w.example)
          ) {
            return {
              ...builtIn,
              status: w.status,
              reviewCount: w.reviewCount,
              lastReviewed: w.lastReviewed,
            }
          }
          return w
        })

        const merged =
          missingBuiltIns.length > 0 ? [...syncedExisting, ...missingBuiltIns] : syncedExisting

        this.commitWordsCache(merged, true)
        this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
        return true
      } catch (e) {
        console.error('[Storage] Failed to lazy-load seed vocabulary:', e)
        return false
      } finally {
        this.seedPromise = null
      }
    })()

    return this.seedPromise
  }

  // O(1) IN-MEMORY WORDS READ
  public getWords(deckId?: string): WordItem[] {
    if (!this.wordsCache) {
      this.wordsCache = this.get<WordItem[]>(STORAGE_KEYS.WORDS, [])
    }

    if (!deckId) {
      return this.wordsCache
    }

    const cachedDeckWords = this.wordsByDeckCache.get(deckId)
    if (cachedDeckWords) {
      return cachedDeckWords
    }

    const filtered = this.wordsCache.filter((w) => w.deckId === deckId)
    this.wordsByDeckCache.set(deckId, filtered)
    return filtered
  }

  public addWord(word: Omit<WordItem, 'id' | 'status' | 'reviewCount'>): WordItem {
    const words = this.getWords()
    const newWord: WordItem = {
      ...word,
      id: `w-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: 'new',
      reviewCount: 0,
    }
    this.commitWordsCache([newWord, ...words], true)
    return newWord
  }

  public updateWord(updatedWord: WordItem): void {
    const words = this.getWords()
    const updated = words.map((w) => (w.id === updatedWord.id ? updatedWord : w))
    this.commitWordsCache(updated, true)
  }

  public deleteWord(id: string): void {
    const words = this.getWords()
    // Custom/imported words always start with 'w-'; built-in IDs use deck prefixes
    if (!id.startsWith('w-')) {
      const deleted = this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, [])
      if (!deleted.includes(id)) {
        this.set(STORAGE_KEYS.DELETED_BUILTINS, [...deleted, id])
      }
    }
    const updated = words.filter((w) => w.id !== id)
    this.commitWordsCache(updated, true)
  }

  public updateWordStatus(
    id: string,
    status: WordItem['status'],
    countActivity: boolean = true
  ): void {
    const words = this.getWords()
    const now = Date.now()
    const updated = words.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          status,
          reviewCount: status === 'mastered' ? w.reviewCount : w.reviewCount + 1,
          lastReviewed: now,
        }
      }
      return w
    })
    // Debounced disk flush keeps rapid flashcard swipes & game combos 60fps smooth
    this.commitWordsCache(updated, false)
    if (countActivity) {
      this.recordDailyActivity(true)
    }
  }

  public async resetDeckProgress(deckId: string): Promise<void> {
    const deleted = this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, [])
    let baseWords = this.getWords()

    if (deleted.length > 0) {
      try {
        const { INITIAL_WORDS } = await import('../data/initialDecks')
        const deckBuiltIns = INITIAL_WORDS.filter((w) => w.deckId === deckId)
        const deckBuiltInIds = new Set(deckBuiltIns.map((w) => w.id))
        const filteredDeleted = deleted.filter((id) => !deckBuiltInIds.has(id))
        this.set(STORAGE_KEYS.DELETED_BUILTINS, filteredDeleted)

        const existingIds = new Set(baseWords.map((w) => w.id))
        const restored = deckBuiltIns.filter((w) => !existingIds.has(w.id))
        if (restored.length > 0) {
          baseWords = [...baseWords, ...restored]
        }
      } catch {}
    }

    const updated = baseWords.map((w) => {
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
    this.commitWordsCache(updated, true)
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
      this.commitWordsCache([...newWordsList, ...allWords], true)
    }

    return {
      added: newWordsList.length,
      skipped,
    }
  }

  // STUDY PREFERENCES
  public getStudyPreferences(): StudyPreferences {
    const raw = this.get<Partial<StudyPreferences>>(STORAGE_KEYS.STUDY_PREFS, {})
    return {
      shuffle: Boolean(raw.shuffle),
      batchSize: typeof raw.batchSize === 'number' ? raw.batchSize : 25,
    }
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
  public async resetToDefaults(): Promise<void> {
    if (!this.isLocalStorageAvailable()) return
    const { INITIAL_WORDS } = await import('../data/initialDecks')
    this.set(STORAGE_KEYS.DELETED_BUILTINS, [])
    this.decksCache = INITIAL_DECKS
    this.set(STORAGE_KEYS.DECKS, INITIAL_DECKS)
    this.commitWordsCache(INITIAL_WORDS, true)
    this.set(STORAGE_KEYS.ACTIVE_DECK, INITIAL_DECKS[0].id)
    this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)
  }
}

export const storageService = new SafeStorageService()
