/**
 * Condenses verbose multi-clause dictionary definitions into crisp, scannable
 * core meanings for fast-paced Arcade games (2-Second Blitz, 60s Speed Match,
 * Sky Defender radar) while preserving full definitions in Flashcards & Library.
 */
export function formatArcadeMeaning(definition: string, maxChars = 96): string {
  const clean = definition.trim()
  if (clean.length <= maxChars) return clean

  // 1. Prefer splitting before secondary explanatory clauses
  const clauseSeparators = [
    '; ',
    '. ',
    ', giúp ',
    ', nhằm ',
    ', cho phép ',
    ', thường được ',
    ', được áp dụng ',
    ', xảy ra khi ',
    ', gây khó khăn ',
    ' nhằm ',
    ' để tránh ',
  ]

  for (const sep of clauseSeparators) {
    const idx = clean.indexOf(sep)
    if (idx >= 24 && idx <= maxChars) {
      return clean.slice(0, idx).trim()
    }
  }

  // 2. Fallback: clean word-boundary truncation
  const sliced = clean.slice(0, maxChars - 1)
  const lastSpace = sliced.lastIndexOf(' ')
  const cut = lastSpace > 45 ? sliced.slice(0, lastSpace) : sliced
  return `${cut.replace(/[,;:\s]+$/, '')}…`
}
