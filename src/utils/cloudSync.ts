import type {
  BuiltInWordProgress,
  CommunityDeck,
  Deck,
  LeaderboardEntry,
  WordItem,
} from '../types'
import { storageService } from './storage'

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://eecfteeivqwkgzeezcfm.supabase.co'

const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'sb_publishable_8WC_in4KQdELt8WD2npIhQ_Kw3WCu9A'

const SYNC_CODE_STORAGE_KEY = 'vocabflow_sync_code'
const NICKNAME_STORAGE_KEY = 'vocabflow_nickname'
const LAST_SYNCED_AT_KEY = 'vocabflow_last_synced_at'
const SHARED_DECK_IDS_KEY = 'vocabflow_shared_deck_ids'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 unambiguous chars (no 0/O/1/I)
const SYNC_CODE_REGEX = /^VF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export interface SyncStateSnapshot {
  syncCode: string
  nickname: string
  status: SyncStatus
  lastSyncedAt: number | null
  errorMessage?: string
}

export interface RestoreOutcome {
  ok: boolean
  message: string
  masteredCount?: number
  customDecksCount?: number
  totalScore?: number
}

function generateSyncCode(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let chars = ''
  for (let i = 0; i < 8; i++) {
    chars += ALPHABET[bytes[i] & 31]
  }
  return `VF-${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

export function normalizeSyncCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  let body = cleaned
  if (cleaned.startsWith('VF') && cleaned.length === 10) {
    body = cleaned.slice(2)
  }
  if (body.length !== 8) return null
  const formatted = `VF-${body.slice(0, 4)}-${body.slice(4, 8)}`
  return SYNC_CODE_REGEX.test(formatted) ? formatted : null
}

export async function computePlayerTag(syncCode: string): Promise<string> {
  const encoded = new TextEncoder().encode(syncCode.trim().toUpperCase())
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class CloudSyncManager {
  private status: SyncStatus = 'idle'
  private errorMessage: string | undefined
  private debounceTimer: number | null = null
  private pendingPush = false
  private listeners = new Set<() => void>()
  private initialized = false

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {}
    }
  }

  public getSyncCode(): string {
    if (typeof window === 'undefined') return 'VF-AAAA-2222'
    try {
      const saved = window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)
      if (saved && SYNC_CODE_REGEX.test(saved)) {
        return saved
      }
      const created = generateSyncCode()
      window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, created)
      return created
    } catch {
      return generateSyncCode()
    }
  }

  public getNickname(): string {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage.getItem(NICKNAME_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  }

  public setNickname(name: string): void {
    const clean = name.trim().slice(0, 32)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, clean)
      } catch {}
    }
    this.emit()
    this.schedulePush()
  }

  public getLastSyncedAt(): number | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = Number(window.localStorage.getItem(LAST_SYNCED_AT_KEY) || '0')
      return raw > 0 ? raw : null
    } catch {
      return null
    }
  }

  private setLastSyncedAt(ts: number): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LAST_SYNCED_AT_KEY, String(ts))
      } catch {}
    }
  }

  public getSharedDeckIds(): Set<string> {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(SHARED_DECK_IDS_KEY)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  }

  private saveSharedDeckIds(ids: Set<string>): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SHARED_DECK_IDS_KEY, JSON.stringify([...ids]))
      } catch {}
    }
  }

  public getSnapshot(): SyncStateSnapshot {
    const syncedAt = this.getLastSyncedAt()
    return {
      syncCode: this.getSyncCode(),
      nickname: this.getNickname(),
      status: this.status === 'idle' && syncedAt ? 'synced' : this.status,
      lastSyncedAt: syncedAt,
      errorMessage: this.errorMessage,
    }
  }

  // Initialize auto-sync listeners & check ?sync=VF-XXXX-XXXX QR magic link on boot
  public async init(onRemoteHydrated: () => void): Promise<RestoreOutcome | null> {
    if (!this.initialized && typeof window !== 'undefined') {
      this.initialized = true
      this.getSyncCode() // Ensure device has a persistent Sync ID ready

      storageService.subscribeMutations(() => {
        this.schedulePush()
      })

      const flushOnHide = () => {
        if (this.pendingPush) {
          void this.pushNow(false, true)
        }
      }
      window.addEventListener('pagehide', flushOnHide)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushOnHide()
      })
    }

    // 1. Check URL magic QR parameter (?sync=VF-XXXX-XXXX)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const urlCode = params.get('sync')
      if (urlCode) {
        params.delete('sync')
        const cleanQuery = params.toString()
        const cleanUrl =
          window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash
        window.history.replaceState({}, '', cleanUrl)

        const outcome = await this.restoreFromCode(urlCode)
        if (outcome.ok) {
          onRemoteHydrated()
        }
        return outcome
      }
    }

    // 2. If this device previously synced, merge any newer updates from other devices
    if (this.getLastSyncedAt()) {
      const merged = await this.pullAndMerge()
      if (merged) {
        onRemoteHydrated()
      }
    }

    return null
  }

  public schedulePush(): void {
    this.pendingPush = true
    if (typeof window === 'undefined') return
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null
      void this.pushNow(false, false)
    }, 1800)
  }

  private buildProfilePayload() {
    const syncCode = this.getSyncCode()
    const nickname = this.getNickname()
    const allWords = storageService.getWords()
    const allDecks = storageService.getDecks()
    const highScores = storageService.getHighScores()

    const builtInProgress: Record<string, BuiltInWordProgress> = {}
    const customWords: WordItem[] = []
    let masteredCount = 0
    let activeProgressCount = 0

    for (const w of allWords) {
      if (w.status === 'mastered') masteredCount++

      if (w.id.startsWith('w-')) {
        customWords.push(w)
      } else if (!w.id.startsWith('commword-') && (w.status !== 'new' || w.reviewCount > 0)) {
        activeProgressCount++
        builtInProgress[w.id] = {
          s: w.status,
          r: w.reviewCount,
          ...(w.lastReviewed ? { t: w.lastReviewed } : {}),
          ...(typeof w.srsLevel === 'number' ? { l: w.srsLevel } : {}),
          ...(typeof w.nextReview === 'number' ? { n: w.nextReview } : {}),
        }
      }
    }

    const customDecks = allDecks.filter((d) => !d.isBuiltIn && !d.id.startsWith('commdeck-'))
    const totalScore =
      (highScores['sky-defender'] || 0) +
      (highScores['speed-match'] || 0) +
      (highScores['blitz-2s'] || 0)

    const hasMeaningfulActivity =
      activeProgressCount > 0 ||
      customDecks.length > 0 ||
      customWords.length > 0 ||
      totalScore > 0 ||
      nickname.trim().length > 0

    return {
      hasMeaningfulActivity,
      totalScore,
      highScores,
      masteredCount,
      row: {
        sync_code: syncCode,
        nickname,
        built_in_progress: builtInProgress,
        deleted_builtins: storageService.getDeletedBuiltIns(),
        custom_decks: customDecks,
        custom_words: customWords,
        study_prefs: storageService.getStudyPreferences(),
        daily_progress: storageService.getDailyProgress(),
        streak: storageService.getStudyStreak(),
        last_active_date: storageService.getLastActiveDate(),
        high_scores: highScores,
        mastered_count: masteredCount,
        updated_at: new Date().toISOString(),
      },
    }
  }

  public async pushNow(force = false, keepalive = false): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false

    const payload = this.buildProfilePayload()
    if (!force && !payload.hasMeaningfulActivity && !this.getLastSyncedAt()) {
      this.pendingPush = false
      return false
    }

    const syncCode = payload.row.sync_code
    this.status = 'syncing'
    this.errorMessage = undefined
    this.emit()

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vocab_profiles?on_conflict=sync_code`, {
        method: 'POST',
        keepalive,
        headers: {
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
          'x-sync-code': syncCode,
        },
        body: JSON.stringify(payload.row),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Also update public Arcade Leaderboard if player has scores or set a nickname
      if (payload.totalScore > 0 || payload.row.nickname.trim().length > 0) {
        const playerTag = await computePlayerTag(syncCode)
        const displayNick = payload.row.nickname.trim() || `Chiến binh ${syncCode.slice(-4)}`
        await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_entries?on_conflict=player_tag`, {
          method: 'POST',
          keepalive,
          headers: {
            apikey: SUPABASE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
            'x-sync-code': syncCode,
          },
          body: JSON.stringify({
            player_tag: playerTag,
            nickname: displayNick,
            sky_score: payload.highScores['sky-defender'] || 0,
            match_score: payload.highScores['speed-match'] || 0,
            blitz_score: payload.highScores['blitz-2s'] || 0,
            mastered_count: payload.masteredCount,
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {})
      }

      // Auto-sync any custom decks that user marked as Shared to Community!
      const sharedIds = this.getSharedDeckIds()
      if (sharedIds.size > 0 && !keepalive) {
        for (const deck of payload.row.custom_decks) {
          if (sharedIds.has(deck.id)) {
            const deckWords = storageService.getWords(deck.id)
            if (deckWords.length > 0) {
              await this.publishCommunityDeck(deck, deckWords).catch(() => {})
            }
          }
        }
      }

      this.pendingPush = false
      this.status = 'synced'
      this.setLastSyncedAt(Date.now())
      this.emit()
      return true
    } catch (e) {
      this.status = 'error'
      this.errorMessage = e instanceof Error ? e.message : 'Lỗi kết nối mạng'
      this.emit()
      return false
    }
  }

  // Pull & merge updates from Cloud for the current Sync ID
  public async pullAndMerge(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false
    const syncCode = this.getSyncCode()

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vocab_profiles?select=*&limit=1`, {
        headers: {
          apikey: SUPABASE_KEY,
          'x-sync-code': syncCode,
        },
      })
      if (!res.ok) return false
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) return false

      const remote = rows[0]
      await storageService.applyCloudData(remote, 'merge')
      if (remote.nickname && !this.getNickname()) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(NICKNAME_STORAGE_KEY, remote.nickname)
        }
      }
      this.status = 'synced'
      this.setLastSyncedAt(Date.now())
      this.emit()
      return true
    } catch {
      return false
    }
  }

  // Restore full profile on a new phone/laptop by entering Sync ID
  public async restoreFromCode(rawInput: string): Promise<RestoreOutcome> {
    const normalized = normalizeSyncCode(rawInput)
    if (!normalized) {
      return {
        ok: false,
        message: 'Mã ID chưa đúng định dạng (ví dụ hợp lệ: VF-8K3M-9P2X).',
      }
    }

    this.status = 'syncing'
    this.errorMessage = undefined
    this.emit()

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vocab_profiles?select=*&limit=1`, {
        headers: {
          apikey: SUPABASE_KEY,
          'x-sync-code': normalized,
        },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) {
        this.status = 'idle'
        this.emit()
        return {
          ok: false,
          message:
            'Chưa tìm thấy dữ liệu trên Cloud cho mã này. Trên máy cũ, bạn hãy mở mục Mã ID và bấm "Đồng bộ ngay" trước nhé!',
        }
      }

      const remote = rows[0]
      await storageService.applyCloudData(remote, 'replace')

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, normalized)
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, remote.nickname || '')
      }

      this.pendingPush = false
      this.status = 'synced'
      this.setLastSyncedAt(Date.now())
      this.emit()

      const hs = remote.high_scores || {}
      const totalScore =
        (hs['sky-defender'] || 0) + (hs['speed-match'] || 0) + (hs['blitz-2s'] || 0)
      const customDecksCount = Array.isArray(remote.custom_decks) ? remote.custom_decks.length : 0

      return {
        ok: true,
        masteredCount: remote.mastered_count || 0,
        customDecksCount,
        totalScore,
        message: `Khôi phục thành công mã ${normalized}! (${remote.mastered_count || 0} từ đã thuộc, ${customDecksCount} bộ từ riêng).`,
      }
    } catch {
      this.status = 'error'
      this.emit()
      return {
        ok: false,
        message: 'Không kết nối được tới máy chủ Cloud. Vui lòng kiểm tra mạng và thử lại.',
      }
    }
  }

  // Fetch Top Arcade Leaderboard
  public async fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/leaderboard_entries?select=*&order=total_score.desc,updated_at.desc&limit=${limit}`,
        {
          headers: { apikey: SUPABASE_KEY },
        }
      )
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? (data as LeaderboardEntry[]) : []
    } catch {
      return []
    }
  }

  // Fetch Community Shared Decks
  public async fetchCommunityDecks(limit = 20): Promise<CommunityDeck[]> {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/community_decks?select=*&order=updated_at.desc&limit=${limit}`,
        {
          headers: { apikey: SUPABASE_KEY },
        }
      )
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? (data as CommunityDeck[]) : []
    } catch {
      return []
    }
  }

  // Publish or update a user's custom deck to Community Library
  public async publishCommunityDeck(deck: Deck, words: WordItem[]): Promise<boolean> {
    if (words.length === 0) return false
    const syncCode = this.getSyncCode()
    const authorTag = await computePlayerTag(syncCode)
    const authorName = this.getNickname().trim() || `Thành viên ${syncCode.slice(-4)}`
    const sharedId = `${authorTag.slice(0, 12)}_${deck.id}`

    const cleanWords = words.slice(0, 500).map((w) => ({
      term: w.term.trim(),
      ipa: w.ipa,
      definition: w.definition.trim(),
      example: w.example,
      partOfSpeech: w.partOfSpeech,
    }))

    const res = await fetch(`${SUPABASE_URL}/rest/v1/community_decks?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
        'x-sync-code': syncCode,
      },
      body: JSON.stringify({
        id: sharedId,
        author_tag: authorTag,
        author_name: authorName,
        name: deck.name.trim(),
        description: deck.description?.trim() || '',
        words: cleanWords,
        word_count: cleanWords.length,
        updated_at: new Date().toISOString(),
      }),
    })

    if (res.ok) {
      const ids = this.getSharedDeckIds()
      ids.add(deck.id)
      this.saveSharedDeckIds(ids)
      return true
    }
    return false
  }

  public async unpublishCommunityDeck(deckId: string): Promise<boolean> {
    const syncCode = this.getSyncCode()
    const authorTag = await computePlayerTag(syncCode)
    const sharedId = `${authorTag.slice(0, 12)}_${deckId}`

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/community_decks?id=eq.${encodeURIComponent(sharedId)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_KEY,
          'x-sync-code': syncCode,
        },
      }
    )

    if (res.ok) {
      const ids = this.getSharedDeckIds()
      ids.delete(deckId)
      this.saveSharedDeckIds(ids)
      return true
    }
    return false
  }
}

export const cloudSyncService = new CloudSyncManager()
