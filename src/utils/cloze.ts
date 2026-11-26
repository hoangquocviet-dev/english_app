export interface ClozeSplitResult {
  sentenceBefore: string
  sentenceAfter: string
  matchedTerm: string
  isFallback: boolean
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeClozeAttempt(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[-_']/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function maskClozeSkeleton(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 2) return `${part[0] || ''}${'_'.repeat(Math.max(0, part.length - 1))}`
      return `${part[0]} ${Array.from({ length: part.length - 2 }, () => '_').join(' ')} ${part[part.length - 1]}`
    })
    .join('   ')
}

const IRREGULAR_VERB_FORMS: Record<string, string> = {
  be: 'be|am|is|are|was|were|been|being',
  beat: 'beat|beats|beaten|beating',
  become: 'become|becomes|became|becoming',
  begin: 'begin|begins|began|begun|beginning',
  blow: 'blow|blows|blew|blown|blowing',
  break: 'break|breaks|broke|broken|breaking',
  bring: 'bring|brings|brought|bringing',
  build: 'build|builds|built|building',
  buy: 'buy|buys|bought|buying',
  call: 'call|calls|called|calling',
  catch: 'catch|catches|caught|catching',
  choose: 'choose|chooses|chose|chosen|choosing',
  come: 'come|comes|came|coming',
  cut: 'cut|cuts|cutting',
  deal: 'deal|deals|dealt|dealing',
  do: 'do|does|did|done|doing',
  draw: 'draw|draws|drew|drawn|drawing',
  drive: 'drive|drives|drove|driven|driving',
  eat: 'eat|eats|ate|eaten|eating',
  fall: 'fall|falls|fell|fallen|falling',
  feel: 'feel|feels|felt|feeling',
  find: 'find|finds|found|finding',
  fly: 'fly|flies|flew|flown|flying',
  forget: 'forget|forgets|forgot|forgotten|forgetting',
  get: 'get|gets|got|gotten|getting',
  give: 'give|gives|gave|given|giving',
  go: 'go|goes|went|gone|going',
  grow: 'grow|grows|grew|grown|growing',
  hang: 'hang|hangs|hung|hanging',
  have: 'have|has|had|having',
  hear: 'hear|hears|heard|hearing',
  hide: 'hide|hides|hid|hidden|hiding',
  hit: 'hit|hits|hitting',
  hold: 'hold|holds|held|holding',
  keep: 'keep|keeps|kept|keeping',
  know: 'know|knows|knew|known|knowing',
  lay: 'lay|lays|laid|laying',
  lead: 'lead|leads|led|leading',
  leave: 'leave|leaves|left|leaving',
  let: 'let|lets|letting',
  lose: 'lose|loses|lost|losing',
  make: 'make|makes|made|making',
  mean: 'mean|means|meant|meaning',
  meet: 'meet|meets|met|meeting',
  pay: 'pay|pays|paid|paying',
  put: 'put|puts|putting',
  read: 'read|reads|reading',
  ring: 'ring|rings|rang|rung|ringing',
  rise: 'rise|rises|rose|risen|rising',
  run: 'run|runs|ran|running',
  say: 'say|says|said|saying',
  see: 'see|sees|saw|seen|seeing',
  sell: 'sell|sells|sold|selling',
  send: 'send|sends|sent|sending',
  set: 'set|sets|setting',
  shake: 'shake|shakes|shook|shaken|shaking',
  show: 'show|shows|showed|shown|showing',
  shut: 'shut|shuts|shutting',
  sing: 'sing|sings|sang|sung|singing',
  sit: 'sit|sits|sat|sitting',
  sleep: 'sleep|sleeps|slept|sleeping',
  speak: 'speak|speaks|spoke|spoken|speaking',
  spend: 'spend|spends|spent|spending',
  stand: 'stand|stands|stood|standing',
  steal: 'steal|steals|stole|stolen|stealing',
  stick: 'stick|sticks|stuck|sticking',
  sweep: 'sweep|sweeps|swept|sweeping',
  take: 'take|takes|took|taken|taking',
  teach: 'teach|teaches|taught|teaching',
  tear: 'tear|tears|tore|torn|tearing',
  tell: 'tell|tells|told|telling',
  think: 'think|thinks|thought|thinking',
  throw: 'throw|throws|threw|thrown|throwing',
  understand: 'understand|understands|understood|understanding',
  wake: 'wake|wakes|woke|woken|waking',
  wear: 'wear|wears|wore|worn|wearing',
  win: 'win|wins|won|winning',
  write: 'write|writes|wrote|written|writing',
}

function buildTokenInflectionPattern(token: string): string {
  const lower = token.toLowerCase()
  if (['your', 'my', 'his', 'her', 'their', 'our', "one's", "someone's"].includes(lower)) {
    return "(?:your|my|his|her|their|our|one's|someone's)"
  }
  if (['oneself', 'yourself', 'myself'].includes(lower)) {
    return '(?:oneself|yourself|myself|himself|herself|themselves|ourselves)'
  }
  if (IRREGULAR_VERB_FORMS[lower]) {
    return `(?:${IRREGULAR_VERB_FORMS[lower]})`
  }
  if (lower.length >= 4 && lower.endsWith('y') && !/[aeiou]y$/.test(lower)) {
    const stem = escapeRegExp(lower.slice(0, -1))
    return `${stem}(?:y|ies|ied|ying|ier|iest)`
  }
  if (lower.length >= 4 && lower.endsWith('e')) {
    const stem = escapeRegExp(lower.slice(0, -1))
    return `${stem}(?:e|es|ed|ing|er|ers|ation|ations|able)`
  }
  const esc = escapeRegExp(lower)
  const lastChar = lower[lower.length - 1] || ''
  return `${esc}(?:${escapeRegExp(lastChar)})?(?:s|es|ed|ing|er|ers|tion|ation)?`
}

export function splitClozeSentence(
  sentence: string,
  term: string,
  definition?: string
): ClozeSplitResult {
  const exactPattern = new RegExp(`(^|[^a-zA-Z0-9_-])(${escapeRegExp(term)})([^a-zA-Z0-9_-]|$)`, 'i')
  const exactMatch = exactPattern.exec(sentence)

  if (exactMatch && typeof exactMatch.index === 'number') {
    const prefixLen = exactMatch[1].length
    const matchStart = exactMatch.index + prefixLen
    const matchedTerm = exactMatch[2]
    const matchEnd = matchStart + matchedTerm.length
    return {
      sentenceBefore: sentence.slice(0, matchStart),
      sentenceAfter: sentence.slice(matchEnd),
      matchedTerm,
      isFallback: false,
    }
  }

  const rawTokens = term.trim().split(/\s+/).filter(Boolean)
  if (rawTokens.length > 0) {
    const tokenPatterns = rawTokens.map((tok, idx) =>
      idx === 0 ||
      rawTokens.length === 1 ||
      ['your', 'my', "one's", 'oneself', 'yourself'].includes(tok.toLowerCase())
        ? buildTokenInflectionPattern(tok)
        : escapeRegExp(tok)
    )
    const flexBody =
      tokenPatterns.length > 1
        ? tokenPatterns.join('(?:\\s+[a-zA-Z]+){0,5}?\\s+')
        : tokenPatterns[0]
    const inflectRegex = new RegExp(`(^|[^a-zA-Z0-9_-])(${flexBody})(?=[^a-zA-Z0-9_-]|$)`, 'i')
    const inflectMatch = inflectRegex.exec(sentence)
    if (inflectMatch && typeof inflectMatch.index === 'number') {
      const prefixLen = inflectMatch[1].length
      const matchStart = inflectMatch.index + prefixLen
      const matchedTerm = inflectMatch[2]
      const matchEnd = matchStart + matchedTerm.length
      return {
        sentenceBefore: sentence.slice(0, matchStart),
        sentenceAfter: sentence.slice(matchEnd),
        matchedTerm,
        isFallback: false,
      }
    }
  }

  const subIdx = sentence.toLowerCase().indexOf(term.toLowerCase())
  if (subIdx !== -1) {
    const matchedTerm = sentence.slice(subIdx, subIdx + term.length)
    return {
      sentenceBefore: sentence.slice(0, subIdx),
      sentenceAfter: sentence.slice(subIdx + term.length),
      matchedTerm,
      isFallback: false,
    }
  }

  return {
    sentenceBefore: definition
      ? `Chọn từ/cụm từ mang nghĩa "${definition}": `
      : 'Chọn từ/cụm từ phù hợp nhất với ngữ cảnh: ',
    sentenceAfter: ` (${sentence})`,
    matchedTerm: term,
    isFallback: true,
  }
}
