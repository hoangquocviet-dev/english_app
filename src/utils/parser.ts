import type { WordItem } from '../types'

export type ExportFormat = 'md' | 'csv' | 'json'

export interface ParseResult {
  words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>>
  skippedCount: number
  totalLines: number
  detectedFormat?: 'markdown' | 'csv' | 'tsv' | 'json'
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function normalizeIpa(raw?: string): string | undefined {
  if (!raw) return undefined
  const clean = raw.trim().replace(/^\/+|\/+$/g, '').trim()
  return clean ? `/${clean}/` : undefined
}

function isHeaderRow(term: string, def: string): boolean {
  const t = term.trim().toLowerCase()
  const d = def.trim().toLowerCase()
  const termHeaders = new Set(['term', 'word', 'english', 'en', 'front', 'tu', 'từ', 'từ vựng'])
  const defHeaders = new Set([
    'definition',
    'meaning',
    'vietnamese',
    'vi',
    'back',
    'nghia',
    'nghĩa',
    'giải nghĩa',
  ])
  return termHeaders.has(t) && defHeaders.has(d)
}

/**
 * Smart multi-format parser supporting:
 * 1. JSON array (or { words: [...] })
 * 2. TSV (Quizlet / Anki / Excel copy-paste: Term \t Definition [\t IPA \t Example])
 * 3. CSV (Term, Definition [, IPA, PartOfSpeech, Example])
 * 4. Markdown / daily-english ([- ] Term [/IPA/]: Definition)
 */
export function parseDailyEnglish(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { words: [], skippedCount: 0, totalLines: 0 }
  }

  // 1. Try JSON array or object { words: [...] }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const rawArray = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { words?: unknown[] }).words)
          ? (parsed as { words: unknown[] }).words
          : null

      if (rawArray) {
        const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
        let skippedCount = 0
        for (const item of rawArray) {
          if (!item || typeof item !== 'object') {
            skippedCount++
            continue
          }
          const rec = item as Record<string, unknown>
          const term = String(rec.term ?? rec.word ?? rec.en ?? rec.front ?? '').trim()
          const definition = String(
            rec.definition ?? rec.meaning ?? rec.vi ?? rec.back ?? ''
          ).trim()
          if (!term || !definition) {
            skippedCount++
            continue
          }
          const ipa = typeof rec.ipa === 'string' ? normalizeIpa(rec.ipa) : undefined
          const partOfSpeech =
            typeof rec.partOfSpeech === 'string' && rec.partOfSpeech.trim()
              ? rec.partOfSpeech.trim()
              : undefined
          const example =
            typeof rec.example === 'string' && rec.example.trim()
              ? rec.example.trim()
              : undefined

          words.push({ term, definition, ipa, partOfSpeech, example })
        }
        return {
          words,
          skippedCount,
          totalLines: rawArray.length,
          detectedFormat: 'json',
        }
      }
    } catch {
      // Fall through to line-by-line parsing
    }
  }

  const lines = text.split(/\r?\n/)
  const nonEmptyLines = lines.map((l) => l.trim()).filter(Boolean)

  // 2. Check if majority of lines are Tab-separated (TSV from Quizlet/Anki/Excel)
  const tabLineCount = nonEmptyLines.filter((l) => l.includes('\t')).length
  if (nonEmptyLines.length > 0 && tabLineCount >= Math.ceil(nonEmptyLines.length * 0.6)) {
    const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
    let skippedCount = 0
    nonEmptyLines.forEach((line, idx) => {
      const cols = line.split('\t').map((c) => c.trim())
      const term = cols[0] || ''
      const definition = cols[1] || ''
      if (!term || !definition) {
        skippedCount++
        return
      }
      if (idx === 0 && isHeaderRow(term, definition)) return
      const ipa = normalizeIpa(cols[2])
      const example = cols[3] || undefined
      words.push({ term, definition, ipa, example })
    })
    return { words, skippedCount, totalLines: lines.length, detectedFormat: 'tsv' }
  }

  // 3. Check if lines are CSV (contain commas, and no Markdown `Term: Meaning` colons)
  const colonLineCount = nonEmptyLines.filter((l) => l.includes(':')).length
  const commaLineCount = nonEmptyLines.filter((l) => l.includes(',')).length
  if (
    nonEmptyLines.length > 0 &&
    colonLineCount === 0 &&
    commaLineCount >= Math.ceil(nonEmptyLines.length * 0.6)
  ) {
    const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
    let skippedCount = 0
    nonEmptyLines.forEach((line, idx) => {
      const cols = parseCsvLine(line)
      const term = cols[0] || ''
      const definition = cols[1] || ''
      if (!term || !definition) {
        skippedCount++
        return
      }
      if (idx === 0 && isHeaderRow(term, definition)) return
      const ipa = normalizeIpa(cols[2])
      const partOfSpeech = cols[3] || undefined
      const example = cols[4] || undefined
      words.push({ term, definition, ipa, partOfSpeech, example })
    })
    return { words, skippedCount, totalLines: lines.length, detectedFormat: 'csv' }
  }

  // 4. Default Markdown / daily-english: `Term [/IPA/]: Definition` (strips bullets/numbers)
  const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
  let skippedCount = 0

  for (const rawLine of lines) {
    const line = rawLine
      .trim()
      .replace(/^[-*•+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim()
    if (!line || line.startsWith('#')) continue

    // Find the first colon ':' (or dash ' - ' fallback) not inside slashes /.../
    let sepIndex = -1
    let sepLen = 1
    let insideSlash = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '/') {
        insideSlash = !insideSlash
      } else if (char === ':' && !insideSlash) {
        sepIndex = i
        sepLen = 1
        break
      }
    }

    if (sepIndex === -1) {
      const dashMatch = /\s+[–—-]\s+/.exec(line)
      if (dashMatch && typeof dashMatch.index === 'number') {
        sepIndex = dashMatch.index
        sepLen = dashMatch[0].length
      }
    }

    if (sepIndex === -1) {
      skippedCount++
      continue
    }

    const leftPart = line.substring(0, sepIndex).trim()
    const rightPart = line.substring(sepIndex + sepLen).trim()

    if (!leftPart || !rightPart) {
      skippedCount++
      continue
    }

    let term = leftPart
    let ipa: string | undefined

    const slashStart = leftPart.indexOf('/')
    const slashEnd = leftPart.lastIndexOf('/')

    if (slashStart !== -1 && slashEnd !== -1 && slashEnd > slashStart) {
      term = leftPart.substring(0, slashStart).trim()
      ipa = normalizeIpa(leftPart.substring(slashStart + 1, slashEnd))
    }

    term = term.replace(/^\*\*|\*\*$/g, '').trim()

    if (!term) {
      skippedCount++
      continue
    }

    words.push({
      term,
      ipa,
      definition: rightPart,
    })
  }

  return {
    words,
    skippedCount,
    totalLines: lines.length,
    detectedFormat: 'markdown',
  }
}

/**
 * Exports words into daily-english Markdown format:
 * Word [/IPA/]: Definition
 */
export function exportDailyEnglish(words: WordItem[]): string {
  return words
    .map((w) => {
      const cleanTerm = w.term.trim()
      const cleanIpa = w.ipa ? ` ${w.ipa.trim()}` : ''
      const cleanDef = w.definition.trim()
      return `${cleanTerm}${cleanIpa}: ${cleanDef}`
    })
    .join('\n\n')
}

function escapeCsvCell(val?: string): string {
  const s = (val || '').trim()
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Exports words into standard CSV (compatible with Excel, Google Sheets, Anki)
 */
export function exportVocabCsv(words: WordItem[]): string {
  const header = 'term,definition,ipa,partOfSpeech,example'
  const rows = words.map((w) =>
    [
      escapeCsvCell(w.term),
      escapeCsvCell(w.definition),
      escapeCsvCell(w.ipa),
      escapeCsvCell(w.partOfSpeech),
      escapeCsvCell(w.example),
    ].join(',')
  )
  return [header, ...rows].join('\r\n')
}

/**
 * Exports words into structured JSON backup
 */
export function exportVocabJson(words: WordItem[]): string {
  const clean = words.map((w) => ({
    term: w.term.trim(),
    definition: w.definition.trim(),
    ...(w.ipa ? { ipa: w.ipa.trim() } : {}),
    ...(w.partOfSpeech ? { partOfSpeech: w.partOfSpeech } : {}),
    ...(w.example ? { example: w.example.trim() } : {}),
  }))
  return JSON.stringify(clean, null, 2)
}
