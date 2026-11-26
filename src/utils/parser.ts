import type { WordItem } from '../types'

export type ExportFormat = 'md' | 'csv' | 'tsv' | 'json'

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

const POS_TAG_MAP: Record<string, string> = {
  n: 'noun',
  noun: 'noun',
  v: 'verb',
  'v.t': 'verb',
  'v.i': 'verb',
  vt: 'verb',
  vi: 'verb',
  verb: 'verb',
  a: 'adj',
  adj: 'adj',
  adjective: 'adj',
  adv: 'adv',
  adverb: 'adv',
  prep: 'prep',
  preposition: 'prep',
  conj: 'conj',
  conjunction: 'conj',
  pron: 'pron',
  pronoun: 'pron',
  phr: 'phrase',
  phrase: 'phrase',
  idiom: 'phrase',
  'phrasal verb': 'phrase',
  expression: 'phrase',
}

export function normalizePartOfSpeech(rawPos?: string): string | undefined {
  if (!rawPos) return undefined
  const clean = rawPos.trim().toLowerCase().replace(/\.$/, '')
  if (!clean) return undefined
  return POS_TAG_MAP[clean] || clean
}

const PREPOSITION_HINT_SET = new Set([
  'of',
  'on',
  'in',
  'to',
  'for',
  'with',
  'from',
  'at',
  'into',
  'about',
  'over',
  'under',
  'between',
  'up',
  'out',
])

/**
 * Cleans legacy POS suffixes like `Alloy (n)`, `Horizontal (a,n)`, preposition hints `Consist (of)`,
 * acronym expansions `FAQ (Frequently Asked Questions)`, and accidental duplicate words `Convenience convenience`.
 */
export function normalizeImportedTerm(
  rawTerm: string,
  rawPos?: string
): { term: string; partOfSpeech?: string } {
  let t = rawTerm.replace(/^\*\*|\*\*$/g, '').replace(/\s+/g, ' ').trim()
  let inferredPos = normalizePartOfSpeech(rawPos)

  const parenMatch = /^(.+?)\s*\(([^()]+)\)\s*$/.exec(t)
  if (parenMatch) {
    const base = parenMatch[1].trim()
    const inner = parenMatch[2].trim()
    const innerLower = inner.toLowerCase()
    const posTokens = innerLower
      .split(/[,/&]+/)
      .map((tok) => tok.trim().replace(/\.$/, ''))
      .filter(Boolean)

    if (posTokens.length > 0 && posTokens.every((tok) => tok in POS_TAG_MAP)) {
      t = base
      if (!inferredPos) {
        inferredPos = POS_TAG_MAP[posTokens[0]]
      }
    } else if (PREPOSITION_HINT_SET.has(innerLower)) {
      t = `${base} ${innerLower}`
      if (!inferredPos) {
        inferredPos = 'phrase'
      }
    } else if (/^[A-Z0-9-]{2,8}$/.test(base) && /^[A-Za-z][A-Za-z0-9\s-]{5,}$/.test(inner)) {
      t = base
      if (!inferredPos) {
        inferredPos = 'noun'
      }
    }
  }

  // Collapse accidental repeated single-word typos like "Convenience convenience"
  const dupMatch = /^([A-Za-z-]+)\s+([A-Za-z-]+)$/.exec(t)
  if (dupMatch && dupMatch[1].toLowerCase() === dupMatch[2].toLowerCase()) {
    t = dupMatch[1]
  }

  return { term: t, partOfSpeech: inferredPos }
}

function isHeaderRow(term: string, def: string): boolean {
  const t = term.replace(/^\uFEFF/, '').trim().toLowerCase()
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

function isCsvShapedLine(line: string): boolean {
  let inQuotes = false
  let inSlashes = false
  let firstComma = -1
  let firstColon = -1

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (!inQuotes && ch === '/') {
      inSlashes = !inSlashes
    } else if (!inQuotes && ch === ',' && firstComma === -1) {
      firstComma = i
    } else if (!inQuotes && !inSlashes && ch === ':' && firstColon === -1) {
      firstColon = i
    }
  }

  return firstComma !== -1 && (firstColon === -1 || firstComma < firstColon)
}

function isLikelyCsvLines(nonEmptyLines: string[]): boolean {
  if (nonEmptyLines.length === 0) return false
  const firstCols = parseCsvLine(nonEmptyLines[0])
  if (firstCols.length >= 2 && isHeaderRow(firstCols[0], firstCols[1])) {
    return true
  }
  const csvShapedCount = nonEmptyLines.filter((l) => isCsvShapedLine(l)).length
  return csvShapedCount >= Math.ceil(nonEmptyLines.length * 0.6)
}

/**
 * Smart multi-format parser supporting:
 * 1. JSON array (or { words: [...] })
 * 2. TSV (Quizlet / Anki / Excel copy-paste: Term \t Definition [\t IPA \t Example])
 * 3. CSV (Term, Definition [, IPA, PartOfSpeech, Example]) — safe even when definitions/examples contain colons!
 * 4. Markdown / daily-english ([- ] Term [/IPA/]: Definition)
 */
export function parseDailyEnglish(rawInput: string): ParseResult {
  const text = rawInput.replace(/^\uFEFF/, '')
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
          const rawTerm = String(rec.term ?? rec.word ?? rec.en ?? rec.front ?? '').trim()
          const definition = String(
            rec.definition ?? rec.meaning ?? rec.vi ?? rec.back ?? ''
          ).trim()
          const rawPos =
            typeof rec.partOfSpeech === 'string' && rec.partOfSpeech.trim()
              ? rec.partOfSpeech.trim()
              : undefined
          const { term, partOfSpeech } = normalizeImportedTerm(rawTerm, rawPos)
          if (!term || !definition) {
            skippedCount++
            continue
          }
          const ipa = typeof rec.ipa === 'string' ? normalizeIpa(rec.ipa) : undefined
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
      const rawTerm = cols[0] || ''
      const definition = cols[1] || ''
      if (!rawTerm || !definition) {
        skippedCount++
        return
      }
      if (idx === 0 && isHeaderRow(rawTerm, definition)) return
      const { term, partOfSpeech } = normalizeImportedTerm(rawTerm, cols[4] || undefined)
      if (!term) {
        skippedCount++
        return
      }
      const ipa = normalizeIpa(cols[2])
      const example = cols[3] || undefined
      words.push({ term, definition, ipa, partOfSpeech, example })
    })
    return { words, skippedCount, totalLines: lines.length, detectedFormat: 'tsv' }
  }

  // 3. Check if lines are CSV (header row OR unquoted comma precedes any colon)
  if (isLikelyCsvLines(nonEmptyLines)) {
    const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
    let skippedCount = 0
    nonEmptyLines.forEach((line, idx) => {
      const cols = parseCsvLine(line)
      const rawTerm = cols[0] || ''
      const definition = cols[1] || ''
      if (!rawTerm || !definition) {
        skippedCount++
        return
      }
      if (idx === 0 && isHeaderRow(rawTerm, definition)) return
      const { term, partOfSpeech } = normalizeImportedTerm(rawTerm, cols[3] || undefined)
      if (!term) {
        skippedCount++
        return
      }
      const ipa = normalizeIpa(cols[2])
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

    let rawTerm = leftPart
    let ipa: string | undefined

    const slashStart = leftPart.indexOf('/')
    const slashEnd = leftPart.lastIndexOf('/')

    if (slashStart !== -1 && slashEnd !== -1 && slashEnd > slashStart) {
      rawTerm = leftPart.substring(0, slashStart).trim()
      ipa = normalizeIpa(leftPart.substring(slashStart + 1, slashEnd))
    }

    const { term, partOfSpeech } = normalizeImportedTerm(rawTerm)

    if (!term) {
      skippedCount++
      continue
    }

    words.push({
      term,
      ipa,
      partOfSpeech,
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

function sanitizeTsvCell(val?: string): string {
  return (val || '').replace(/[\t\r\n]+/g, ' ').trim()
}

/**
 * Exports words into Tab-Separated Values (TSV) ready for Quizlet, Anki, Excel & Google Sheets
 */
export function exportVocabTsv(words: WordItem[]): string {
  const header = 'term\tdefinition\tipa\texample\tpartOfSpeech'
  const rows = words.map((w) =>
    [
      sanitizeTsvCell(w.term),
      sanitizeTsvCell(w.definition),
      sanitizeTsvCell(w.ipa),
      sanitizeTsvCell(w.example),
      sanitizeTsvCell(w.partOfSpeech),
    ].join('\t')
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
