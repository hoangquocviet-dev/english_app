import { INITIAL_DECKS } from '../data/deckMeta'
import type {
  ArcadeGameId,
  BuiltInWordProgress,
  CommunityDeck,
  Deck,
  GameHighScores,
  StudyFilterMode,
  WordItem,
} from '../types'

const CURRENT_SEED_VERSION = 9

export const GLOBAL_SRS_DECK_ID = '__global_srs__'

export const SRS_INTERVALS_MS: Record<number, number> = {
  1: 1 * 24 * 60 * 60 * 1000, // Level 1: 1 day (86,400,000 ms)
  2: 3 * 24 * 60 * 60 * 1000, // Level 2: 3 days (259,200,000 ms)
  3: 7 * 24 * 60 * 60 * 1000, // Level 3: 7 days (604,800,000 ms)
  4: 14 * 24 * 60 * 60 * 1000, // Level 4: 14 days (1,209,600,000 ms)
  5: 30 * 24 * 60 * 60 * 1000, // Level 5: 30 days (2,592,000,000 ms)
}

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
  history?: Record<string, number>
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
  private mutationListeners = new Set<() => void>()
  private suppressMutationNotify = false

  public subscribeMutations(listener: () => void): () => void {
    this.mutationListeners.add(listener)
    return () => {
      this.mutationListeners.delete(listener)
    }
  }

  private emitMutation(): void {
    if (this.suppressMutationNotify) return
    for (const fn of this.mutationListeners) {
      try {
        fn()
      } catch {}
    }
  }

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

  private commitWordsCache(nextWords: WordItem[], immediate = false, notify = true): void {
    this.wordsCache = nextWords
    this.wordsByDeckCache.clear()
    this.wordsDirty = true
    if (notify) {
      this.emitMutation()
    }

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
    this.emitMutation()
    return newDeck
  }

  public renameDeck(deckId: string, newName: string): boolean {
    const clean = newName.trim()
    if (!clean) return false
    const decks = this.getDecks()
    const target = decks.find((d) => d.id === deckId)
    if (!target || target.isBuiltIn) return false
    const nextDecks = decks.map((d) => (d.id === deckId ? { ...d, name: clean } : d))
    this.decksCache = nextDecks
    this.set(STORAGE_KEYS.DECKS, nextDecks)
    this.emitMutation()
    return true
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
          this.commitWordsCache(INITIAL_WORDS, true, false)
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
              srsLevel: w.srsLevel,
              nextReview: w.nextReview,
              starred: w.starred,
            }
          }
          return w
        })

        const merged =
          missingBuiltIns.length > 0 ? [...syncedExisting, ...missingBuiltIns] : syncedExisting

        this.commitWordsCache(merged, true, false)
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

  public toggleWordStar(id: string): boolean {
    const words = this.getWords()
    let nextStarred = false
    const updated = words.map((w) => {
      if (w.id === id) {
        nextStarred = !w.starred
        return { ...w, starred: nextStarred }
      }
      return w
    })
    this.commitWordsCache(updated, true)
    return nextStarred
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
        let srsLevel = w.srsLevel
        let nextReview = w.nextReview

        if (status === 'mastered') {
          // Promote to next SRS stage (1 -> 2 -> 3 -> 4 -> 5)
          const curLevel = w.srsLevel || 0
          const nextLevel = Math.min(5, Math.max(1, curLevel + 1))
          srsLevel = nextLevel
          nextReview = now + (SRS_INTERVALS_MS[nextLevel] || SRS_INTERVALS_MS[1])
        } else if (status === 'learning') {
          // Demote/reset to level 1 for 1-day spaced repetition
          srsLevel = 1
          nextReview = now + SRS_INTERVALS_MS[1]
        } else {
          srsLevel = undefined
          nextReview = undefined
        }

        return {
          ...w,
          status,
          reviewCount: status === 'mastered' ? w.reviewCount : w.reviewCount + 1,
          lastReviewed: now,
          srsLevel,
          nextReview,
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

  // Spaced Repetition (SRS) helper queries
  public getNowMs(): number {
    return Date.now()
  }

  public getDueReviewWords(deckId?: string): WordItem[] {
    const words = deckId && deckId !== GLOBAL_SRS_DECK_ID ? this.getWords(deckId) : this.getWords()
    const now = Date.now()
    return words.filter((w) => w.status === 'mastered' && (!w.nextReview || w.nextReview <= now))
  }

  public getRemainingWordsForSession(
    deckId: string,
    sessionWords: WordItem[],
    filterMode: StudyFilterMode = 'all'
  ): WordItem[] {
    const now = Date.now()
    const sessionIdSet = new Set(sessionWords.map((w) => w.id))

    if (filterMode === 'custom') {
      const source = deckId === GLOBAL_SRS_DECK_ID ? this.getWords() : this.getWords(deckId)
      return source.filter((w) => sessionIdSet.has(w.id) && w.status === 'learning')
    }

    if (deckId === GLOBAL_SRS_DECK_ID || filterMode === 'global-due') {
      return this.getWords().filter(
        (w) =>
          (w.status === 'mastered' && (!w.nextReview || w.nextReview <= now)) ||
          (sessionIdSet.has(w.id) && w.status !== 'mastered')
      )
    }

    const deckWords = this.getWords(deckId)

    if (filterMode === 'due') {
      return deckWords.filter(
        (w) =>
          (w.status === 'mastered' && (!w.nextReview || w.nextReview <= now)) ||
          (sessionIdSet.has(w.id) && w.status !== 'mastered')
      )
    }

    if (filterMode === 'learning') {
      return deckWords.filter((w) => w.status === 'learning')
    }

    if (filterMode === 'starred') {
      return deckWords.filter((w) => sessionIdSet.has(w.id) && w.status === 'learning')
    }

    return deckWords.filter((w) => w.status !== 'mastered')
  }

  public getSrsStats(deckId?: string): {
    dueCount: number
    masteredCount: number
    learningCount: number
    levelCounts: Record<number, number>
  } {
    const words = this.getWords(deckId)
    const now = Date.now()
    let dueCount = 0
    let masteredCount = 0
    let learningCount = 0
    const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    for (const w of words) {
      if (w.status === 'mastered') {
        masteredCount++
        if (!w.nextReview || w.nextReview <= now) {
          dueCount++
        }
        const lvl = w.srsLevel && w.srsLevel >= 1 && w.srsLevel <= 5 ? w.srsLevel : 1
        levelCounts[lvl] = (levelCounts[lvl] || 0) + 1
      } else if (w.status === 'learning') {
        learningCount++
      }
    }

    return { dueCount, masteredCount, learningCount, levelCounts }
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
          srsLevel: undefined,
          nextReview: undefined,
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

  // DAILY GOAL & STREAK (4 AM reset boundary + 14-day rolling activity history)
  private getDateKeyForOffset(daysAgo: number): string {
    const now = new Date()
    const adjusted = new Date(now.getTime() - 4 * 60 * 60 * 1000 - daysAgo * 86400000)
    return `${adjusted.getFullYear()}-${adjusted.getMonth() + 1}-${adjusted.getDate()}`
  }

  private pruneHistory(raw?: Record<string, number>): Record<string, number> {
    if (!raw) return {}
    const validKeys = new Set<string>()
    for (let i = 0; i < 14; i++) {
      validKeys.add(this.getDateKeyForOffset(i))
    }
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (validKeys.has(k) && typeof v === 'number' && v > 0) {
        next[k] = v
      }
    }
    return next
  }

  public getDailyProgress(): DailyProgress {
    const todayKey = this.getTodayKey()
    const saved = this.get<DailyProgress>(STORAGE_KEYS.DAILY_PROGRESS, {
      dateKey: todayKey,
      count: 0,
      goal: 20,
      history: {},
    })
    const mergedHistory = this.pruneHistory({
      ...(saved.history || {}),
      ...(saved.dateKey && saved.count > 0 ? { [saved.dateKey]: saved.count } : {}),
    })
    if (saved.dateKey !== todayKey) {
      return {
        dateKey: todayKey,
        count: mergedHistory[todayKey] || 0,
        goal: saved.goal || 20,
        history: mergedHistory,
      }
    }
    return {
      ...saved,
      history: mergedHistory,
    }
  }

  public getRecentDailySeries(days = 7): Array<{ dateKey: string; label: string; count: number; isToday: boolean }> {
    const prog = this.getDailyProgress()
    const hist = prog.history || {}
    const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    const now = new Date()
    const baseAdjusted = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const series: Array<{ dateKey: string; label: string; count: number; isToday: boolean }> = []

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(baseAdjusted.getTime() - i * 86400000)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      const count = i === 0 ? prog.count : hist[key] || 0
      series.push({
        dateKey: key,
        label: i === 0 ? 'Nay' : weekdayLabels[d.getDay()],
        count,
        isToday: i === 0,
      })
    }
    return series
  }

  public setDailyGoal(goal: number): DailyProgress {
    const cur = this.getDailyProgress()
    const next: DailyProgress = {
      ...cur,
      goal: Math.max(5, Math.min(200, goal)),
    }
    this.set(STORAGE_KEYS.DAILY_PROGRESS, next)
    this.emitMutation()
    return next
  }

  public getStudyStreak(): number {
    const savedStreak = this.get<number>(STORAGE_KEYS.STREAK, 1)
    const lastActive = this.get<string>(STORAGE_KEYS.LAST_ACTIVE_DATE, '')
    if (!lastActive) return savedStreak

    const now = new Date()
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const todayKey = `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`
    if (lastActive === todayKey) return savedStreak

    const yesterdayAdjusted = new Date(adjustedTime.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayKey = `${yesterdayAdjusted.getFullYear()}-${yesterdayAdjusted.getMonth() + 1}-${yesterdayAdjusted.getDate()}`
    if (lastActive === yesterdayKey) return savedStreak

    return 0
  }

  public recordDailyActivity(incrementWordCount: boolean = true): void {
    const now = new Date()
    const adjustedTime = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const todayKey = `${adjustedTime.getFullYear()}-${adjustedTime.getMonth() + 1}-${adjustedTime.getDate()}`

    if (incrementWordCount) {
      const currentDaily = this.getDailyProgress()
      const nextCount = currentDaily.count + 1
      const nextHistory = this.pruneHistory({
        ...(currentDaily.history || {}),
        [todayKey]: nextCount,
      })
      this.set(STORAGE_KEYS.DAILY_PROGRESS, {
        ...currentDaily,
        dateKey: todayKey,
        count: nextCount,
        history: nextHistory,
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
    const raw = this.get<Partial<GameHighScores>>(STORAGE_KEYS.HIGH_SCORES, {})
    return {
      'sky-defender': raw['sky-defender'] || 0,
      'speed-match': raw['speed-match'] || 0,
      'blitz-2s': raw['blitz-2s'] || 0,
      'word-bomb': raw['word-bomb'] || 0,
    }
  }

  public saveHighScore(gameId: ArcadeGameId, score: number): boolean {
    const scores = this.getHighScores()
    const prevBest = scores[gameId] || 0
    if (score > prevBest) {
      this.set(STORAGE_KEYS.HIGH_SCORES, {
        ...scores,
        [gameId]: score,
      })
      this.emitMutation()
      return true
    }
    return false
  }

  public getDeletedBuiltIns(): string[] {
    return this.get<string[]>(STORAGE_KEYS.DELETED_BUILTINS, [])
  }

  public getLastActiveDate(): string {
    return this.get<string>(STORAGE_KEYS.LAST_ACTIVE_DATE, '')
  }

  // CLOUD SYNC HYDRATION (Delta Restore & Cross-Device Merge)
  public async applyCloudData(
    cloud: {
      built_in_progress?: Record<string, BuiltInWordProgress>
      deleted_builtins?: string[]
      custom_decks?: Deck[]
      custom_words?: WordItem[]
      study_prefs?: Partial<StudyPreferences>
      daily_progress?: Partial<DailyProgress>
      streak?: number
      last_active_date?: string
      high_scores?: Partial<GameHighScores>
    },
    mode: 'replace' | 'merge'
  ): Promise<void> {
    this.suppressMutationNotify = true
    try {
      const { INITIAL_WORDS } = await import('../data/initialDecks')
      const cloudDeleted = Array.isArray(cloud.deleted_builtins) ? cloud.deleted_builtins : []
      const localDeleted = mode === 'merge' ? this.getDeletedBuiltIns() : []
      const deletedSet = new Set([...cloudDeleted, ...localDeleted])
      this.set(STORAGE_KEYS.DELETED_BUILTINS, [...deletedSet])

      const progressMap = cloud.built_in_progress || {}
      const localWordsMap = new Map(this.getWords().map((w) => [w.id, w]))

      const rankStatus = (s: WordItem['status']) =>
        s === 'mastered' ? 2 : s === 'learning' ? 1 : 0

      // 1. Reconstruct built-in words with merged/restored progress
      const hydratedBuiltIns: WordItem[] = []
      for (const bw of INITIAL_WORDS) {
        if (deletedSet.has(bw.id)) continue
        const cp = progressMap[bw.id]
        const lw = localWordsMap.get(bw.id)

        if (mode === 'replace') {
          hydratedBuiltIns.push(
            cp
              ? {
                  ...bw,
                  status: cp.s,
                  reviewCount: cp.r || 0,
                  lastReviewed: cp.t,
                  srsLevel: cp.l,
                  nextReview: cp.n,
                  starred: cp.b || undefined,
                }
              : bw
          )
        } else {
          const cs = cp?.s || 'new'
          const ls = lw?.status || 'new'
          const bestStatus = rankStatus(cs) >= rankStatus(ls) ? cs : ls
          const bestReviews = Math.max(cp?.r || 0, lw?.reviewCount || 0)
          const cloudTime = cp?.t || 0
          const localTime = lw?.lastReviewed || 0
          const latestTime = Math.max(cloudTime, localTime) || undefined
          const bestLevel = Math.max(cp?.l || 0, lw?.srsLevel || 0) || undefined
          const nextReview =
            (cloudTime >= localTime ? cp?.n || lw?.nextReview : lw?.nextReview || cp?.n) ||
            undefined
          hydratedBuiltIns.push({
            ...bw,
            status: bestStatus,
            reviewCount: bestReviews,
            lastReviewed: latestTime,
            srsLevel: bestLevel,
            nextReview: nextReview,
            starred: Boolean(cp?.b || lw?.starred) || undefined,
          })
        }
      }

      // 2. Merge custom decks + community decks
      const cloudDecks = Array.isArray(cloud.custom_decks)
        ? cloud.custom_decks.filter((d) => !d.isBuiltIn)
        : []
      const localCustomDecks = this.getDecks().filter((d) => !d.isBuiltIn)

      const customDeckMap = new Map<string, Deck>()
      if (mode === 'merge') {
        for (const ld of localCustomDecks) customDeckMap.set(ld.id, ld)
      } else {
        // Keep locally downloaded community decks even on replace
        for (const ld of localCustomDecks) {
          if (ld.id.startsWith('commdeck-')) customDeckMap.set(ld.id, ld)
        }
      }
      for (const cd of cloudDecks) customDeckMap.set(cd.id, cd)

      const mergedDecks = [...INITIAL_DECKS, ...customDeckMap.values()]
      this.decksCache = mergedDecks
      this.set(STORAGE_KEYS.DECKS, mergedDecks)

      // 3. Merge custom words + community words (preserving newer local SRS/star progress!)
      const validCustomDeckIds = new Set(Array.from(customDeckMap.keys()))
      const cloudWords = Array.isArray(cloud.custom_words) ? cloud.custom_words : []
      const customWordMap = new Map<string, WordItem>()

      if (mode === 'merge') {
        for (const lw of this.getWords()) {
          if (
            (lw.id.startsWith('w-') || lw.id.startsWith('commword-')) &&
            validCustomDeckIds.has(lw.deckId)
          ) {
            customWordMap.set(lw.id, lw)
          }
        }
      } else {
        for (const lw of this.getWords()) {
          if (lw.id.startsWith('commword-') && validCustomDeckIds.has(lw.deckId)) {
            customWordMap.set(lw.id, lw)
          }
        }
      }
      for (const cw of cloudWords) {
        if (!validCustomDeckIds.has(cw.deckId)) continue
        const existingLocal = mode === 'merge' ? customWordMap.get(cw.id) : undefined
        if (!existingLocal) {
          customWordMap.set(cw.id, cw)
        } else {
          const cs = cw.status || 'new'
          const ls = existingLocal.status || 'new'
          const bestStatus = rankStatus(cs) >= rankStatus(ls) ? cs : ls
          const bestReviews = Math.max(cw.reviewCount || 0, existingLocal.reviewCount || 0)
          const cloudTime = cw.lastReviewed || 0
          const localTime = existingLocal.lastReviewed || 0
          const latestTime = Math.max(cloudTime, localTime) || undefined
          const bestLevel = Math.max(cw.srsLevel || 0, existingLocal.srsLevel || 0) || undefined
          const nextReview =
            (cloudTime >= localTime
              ? cw.nextReview || existingLocal.nextReview
              : existingLocal.nextReview || cw.nextReview) || undefined
          const newerBase = cloudTime >= localTime ? cw : existingLocal
          customWordMap.set(cw.id, {
            ...newerBase,
            status: bestStatus,
            reviewCount: bestReviews,
            lastReviewed: latestTime,
            srsLevel: bestLevel,
            nextReview,
            starred: Boolean(cw.starred || existingLocal.starred) || undefined,
          })
        }
      }

      const finalWords = [...customWordMap.values(), ...hydratedBuiltIns]
      this.commitWordsCache(finalWords, true, false)
      this.set(STORAGE_KEYS.SEED_VERSION, CURRENT_SEED_VERSION)

      // 4. High scores, streak, prefs & daily progress
      const localScores = this.getHighScores()
      const cs = cloud.high_scores || {}
      const nextScores: GameHighScores =
        mode === 'replace'
          ? {
              'sky-defender': cs['sky-defender'] || 0,
              'speed-match': cs['speed-match'] || 0,
              'blitz-2s': cs['blitz-2s'] || 0,
              'word-bomb': cs['word-bomb'] || 0,
            }
          : {
              'sky-defender': Math.max(localScores['sky-defender'] || 0, cs['sky-defender'] || 0),
              'speed-match': Math.max(localScores['speed-match'] || 0, cs['speed-match'] || 0),
              'blitz-2s': Math.max(localScores['blitz-2s'] || 0, cs['blitz-2s'] || 0),
              'word-bomb': Math.max(localScores['word-bomb'] || 0, cs['word-bomb'] || 0),
            }
      this.set(STORAGE_KEYS.HIGH_SCORES, nextScores)

      const parseDateKeyMs = (dk?: string): number => {
        if (!dk) return 0
        const parts = dk.split('-').map(Number)
        if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
        return new Date(parts[0], parts[1] - 1, parts[2]).getTime()
      }

      if (mode === 'replace') {
        if (typeof cloud.streak === 'number') {
          this.set(STORAGE_KEYS.STREAK, cloud.streak)
        }
        if (cloud.last_active_date) {
          this.set(STORAGE_KEYS.LAST_ACTIVE_DATE, cloud.last_active_date)
        }
      } else {
        const localDate = this.getLastActiveDate()
        const cloudDate = cloud.last_active_date || ''
        const localMs = parseDateKeyMs(localDate)
        const cloudMs = parseDateKeyMs(cloudDate)
        const localLiveStreak = this.getStudyStreak()

        if (cloudMs > localMs) {
          this.set(STORAGE_KEYS.LAST_ACTIVE_DATE, cloudDate)
          if (typeof cloud.streak === 'number') {
            this.set(STORAGE_KEYS.STREAK, Math.max(localLiveStreak, cloud.streak))
          }
        } else if (cloudMs === localMs && localMs > 0 && typeof cloud.streak === 'number') {
          this.set(STORAGE_KEYS.STREAK, Math.max(localLiveStreak, cloud.streak))
        }
      }

      if (cloud.study_prefs && typeof cloud.study_prefs === 'object') {
        this.setStudyPreferences({
          ...this.getStudyPreferences(),
          ...cloud.study_prefs,
        })
      }
      if (cloud.daily_progress && typeof cloud.daily_progress === 'object') {
        const curDaily = this.getDailyProgress()
        const cloudHist = cloud.daily_progress.history || {}
        const combinedHist: Record<string, number> = {}
        const allKeys = new Set([
          ...Object.keys(curDaily.history || {}),
          ...Object.keys(cloudHist),
        ])
        for (const k of allKeys) {
          const lv = curDaily.history?.[k] || 0
          const cv = cloudHist[k] || 0
          combinedHist[k] = mode === 'replace' ? cv : Math.max(lv, cv)
        }
        if (cloud.daily_progress.dateKey && (cloud.daily_progress.count || 0) > 0) {
          const dk = cloud.daily_progress.dateKey
          combinedHist[dk] =
            mode === 'replace'
              ? cloud.daily_progress.count || 0
              : Math.max(combinedHist[dk] || 0, cloud.daily_progress.count || 0)
        }
        const todayKey = this.getTodayKey()
        const isCloudToday = cloud.daily_progress.dateKey === todayKey
        const nextTodayCount = isCloudToday
          ? mode === 'replace'
            ? cloud.daily_progress.count || 0
            : Math.max(curDaily.count, cloud.daily_progress.count || 0)
          : combinedHist[todayKey] || curDaily.count
        combinedHist[todayKey] = nextTodayCount

        this.set(STORAGE_KEYS.DAILY_PROGRESS, {
          dateKey: todayKey,
          goal: cloud.daily_progress.goal || curDaily.goal,
          count: nextTodayCount,
          history: this.pruneHistory(combinedHist),
        })
      }
    } finally {
      this.suppressMutationNotify = false
    }
  }

  // Install or refresh a Community Shared Deck locally for offline study & games
  public upsertCommunityDeckLocally(commDeck: CommunityDeck): string {
    const localDeckId = `commdeck-${commDeck.id}`
    const decks = this.getDecks()
    const desc = commDeck.description
      ? `${commDeck.description} (Chia sẻ bởi ${commDeck.author_name})`
      : `Bộ từ cộng đồng chia sẻ bởi ${commDeck.author_name}`

    const existingDeck = decks.find((d) => d.id === localDeckId)
    const nextDecks = existingDeck
      ? decks.map((d) => (d.id === localDeckId ? { ...d, name: commDeck.name, description: desc } : d))
      : [
          ...decks,
          {
            id: localDeckId,
            name: commDeck.name,
            description: desc,
            isBuiltIn: false,
            createdAt: Date.now(),
          },
        ]

    this.decksCache = nextDecks
    this.set(STORAGE_KEYS.DECKS, nextDecks)

    const allWords = this.getWords()
    const existingByTerm = new Map<string, WordItem>()
    for (const w of allWords) {
      if (w.deckId === localDeckId) {
        existingByTerm.set(w.term.trim().toLowerCase(), w)
      }
    }

    const syncedDeckWords: WordItem[] = commDeck.words.map((cw, idx) => {
      const prev = existingByTerm.get(cw.term.trim().toLowerCase())
      return {
        id: prev?.id || `commword-${commDeck.id}-${idx}`,
        deckId: localDeckId,
        term: cw.term.trim(),
        ipa: cw.ipa?.trim() || undefined,
        definition: cw.definition.trim(),
        example: cw.example?.trim() || undefined,
        partOfSpeech: cw.partOfSpeech || undefined,
        status: prev?.status || 'new',
        reviewCount: prev?.reviewCount || 0,
        lastReviewed: prev?.lastReviewed,
        srsLevel: prev?.srsLevel,
        nextReview: prev?.nextReview,
        starred: prev?.starred,
      }
    })

    const otherWords = allWords.filter((w) => w.deckId !== localDeckId)
    this.commitWordsCache([...syncedDeckWords, ...otherWords], true, false)
    return localDeckId
  }

  // AUTO-INGEST OFFICIAL DAILY-ENGLISH CLOUD FEED (Only adds net-new daily words!)
  public ingestOfficialDailyFeed(commDeck: CommunityDeck): number {
    if (!Array.isArray(commDeck.words) || commDeck.words.length === 0) return 0
    const allWords = this.getWords()
    const existingTerms = new Set(allWords.map((w) => w.term.trim().toLowerCase()))
    const LIVE_DECK_ID = 'commdeck-daily-auto'

    const freshItems: WordItem[] = []
    for (let i = 0; i < commDeck.words.length; i++) {
      const cw = commDeck.words[i]
      const cleanTerm = (cw.term || '').trim()
      const cleanDef = (cw.definition || '').trim()
      if (!cleanTerm || !cleanDef) continue
      const key = cleanTerm.toLowerCase()
      if (existingTerms.has(key)) continue
      existingTerms.add(key)

      const slug = key.replace(/[^a-z0-9]+/g, '-').slice(0, 28)
      freshItems.push({
        id: `commword-daily-${slug}-${i}`,
        deckId: LIVE_DECK_ID,
        term: cleanTerm,
        ipa: cw.ipa?.trim() || undefined,
        definition: cleanDef,
        example: cw.example?.trim() || undefined,
        partOfSpeech: cw.partOfSpeech || (cleanTerm.includes(' ') ? 'phrase' : 'noun'),
        status: 'new',
        reviewCount: 0,
      })
    }

    if (freshItems.length === 0) return 0

    const decks = this.getDecks()
    if (!decks.some((d) => d.id === LIVE_DECK_ID)) {
      const autoDeck: Deck = {
        id: LIVE_DECK_ID,
        name: '📅 Bài Mới Daily-English',
        description: 'Tự động cập nhật từ mới mỗi chiều từ bot Daily-English của bạn',
        isBuiltIn: false,
        createdAt: Date.now(),
      }
      const nextDecks = [decks[0], autoDeck, ...decks.slice(1)]
      this.decksCache = nextDecks
      this.set(STORAGE_KEYS.DECKS, nextDecks)
    }

    this.commitWordsCache([...freshItems, ...allWords], true, false)
    return freshItems.length
  }

  // FULL OFFLINE PROFILE SNAPSHOT EXPORT / IMPORT (.json)
  public exportFullProfileSnapshot(): string {
    const allWords = this.getWords()
    const builtInProgress: Record<string, BuiltInWordProgress> = {}
    const customWords: WordItem[] = []

    for (const w of allWords) {
      if (w.id.startsWith('w-') || w.id.startsWith('commword-')) {
        customWords.push(w)
      } else if (w.status !== 'new' || w.reviewCount > 0 || w.starred) {
        builtInProgress[w.id] = {
          s: w.status,
          r: w.reviewCount,
          ...(w.lastReviewed ? { t: w.lastReviewed } : {}),
          ...(typeof w.srsLevel === 'number' ? { l: w.srsLevel } : {}),
          ...(typeof w.nextReview === 'number' ? { n: w.nextReview } : {}),
          ...(w.starred ? { b: true } : {}),
        }
      }
    }

    const customDecks = this.getDecks().filter((d) => !d.isBuiltIn)
    const snapshot = {
      app: 'VocabFlow',
      version: CURRENT_SEED_VERSION,
      exportedAt: new Date().toISOString(),
      built_in_progress: builtInProgress,
      deleted_builtins: this.getDeletedBuiltIns(),
      custom_decks: customDecks,
      custom_words: customWords,
      study_prefs: this.getStudyPreferences(),
      daily_progress: this.getDailyProgress(),
      streak: this.getStudyStreak(),
      last_active_date: this.getLastActiveDate(),
      high_scores: this.getHighScores(),
    }

    return JSON.stringify(snapshot, null, 2)
  }

  public async importFullProfileSnapshot(
    rawJson: string
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (!('built_in_progress' in parsed) && !('custom_words' in parsed))
      ) {
        return {
          ok: false,
          message: 'File không đúng định dạng bản sao lưu toàn phần của VocabFlow.',
        }
      }

      await this.applyCloudData(
        {
          built_in_progress: parsed.built_in_progress as Record<string, BuiltInWordProgress>,
          deleted_builtins: parsed.deleted_builtins as string[],
          custom_decks: parsed.custom_decks as Deck[],
          custom_words: parsed.custom_words as WordItem[],
          study_prefs: parsed.study_prefs as Partial<StudyPreferences>,
          daily_progress: parsed.daily_progress as Partial<DailyProgress>,
          streak: typeof parsed.streak === 'number' ? parsed.streak : undefined,
          last_active_date:
            typeof parsed.last_active_date === 'string' ? parsed.last_active_date : undefined,
          high_scores: parsed.high_scores as Partial<GameHighScores>,
        },
        'merge'
      )
      this.emitMutation()
      return {
        ok: true,
        message: 'Đã gộp bản sao lưu toàn phần vào máy thành công!',
      }
    } catch {
      return {
        ok: false,
        message: 'Không đọc được nội dung JSON. Vui lòng chọn đúng file sao lưu .json.',
      }
    }
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
