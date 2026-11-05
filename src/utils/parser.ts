import type { WordItem } from '../types'

export interface ParseResult {
  words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>>
  skippedCount: number
  totalLines: number
}

/**
 * Parses markdown/text content formatted according to daily-english conventions:
 * Term [/IPA/]: Definition
 */
export function parseDailyEnglish(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const words: Array<Omit<WordItem, 'id' | 'deckId' | 'status' | 'reviewCount'>> = []
  let skippedCount = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue // Skip empty lines

    // Find the first colon ':' that is not inside slashes /.../
    let colonIndex = -1
    let insideSlash = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '/') {
        insideSlash = !insideSlash
      } else if (char === ':' && !insideSlash) {
        colonIndex = i
        break
      }
    }

    if (colonIndex === -1) {
      skippedCount++
      continue
    }

    const leftPart = line.substring(0, colonIndex).trim()
    const rightPart = line.substring(colonIndex + 1).trim()

    if (!leftPart || !rightPart) {
      skippedCount++
      continue
    }

    // Parse left part for optional /IPA/
    let term = leftPart
    let ipa: string | undefined

    const slashStart = leftPart.indexOf('/')
    const slashEnd = leftPart.lastIndexOf('/')

    if (slashStart !== -1 && slashEnd !== -1 && slashEnd > slashStart) {
      term = leftPart.substring(0, slashStart).trim()
      const rawIpa = leftPart.substring(slashStart + 1, slashEnd).trim()
      if (rawIpa) {
        ipa = `/${rawIpa}/`
      }
    }

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
  }
}

/**
 * Exports words back into daily-english format:
 * Word [/IPA/]: Definition
 */
export function exportDailyEnglish(words: WordItem[]): string {
  return words
    .map(w => {
      const cleanTerm = w.term.trim()
      const cleanIpa = w.ipa ? ` ${w.ipa.trim()}` : ''
      const cleanDef = w.definition.trim()
      return `${cleanTerm}${cleanIpa}: ${cleanDef}`
    })
    .join('\n\n')
}
