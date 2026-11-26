import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react'
import { useState } from 'react'
import type { Deck, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { normalizeImportedTerm } from '../../utils/parser'
import { storageService } from '../../utils/storage'

interface AddWordViewProps {
  decks: Deck[]
  activeDeckId: string
  onWordAdded: (deckId: string) => void
  onGoToPractice: (deckId: string) => void
}

export function AddWordView({
  decks,
  activeDeckId,
  onWordAdded,
  onGoToPractice,
}: AddWordViewProps) {
  const [rawSelectedDeckId, setSelectedDeckId] = useState(activeDeckId)
  const selectedDeckId = decks.some((d) => d.id === rawSelectedDeckId)
    ? rawSelectedDeckId
    : activeDeckId
  const [term, setTerm] = useState('')
  const [ipa, setIpa] = useState('')
  const [partOfSpeech, setPartOfSpeech] = useState('noun')
  const [definition, setDefinition] = useState('')
  const [englishHint, setEnglishHint] = useState('')
  const [example, setExample] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [, setListTick] = useState(0)

  const recentCustomWords = storageService
    .getWords(selectedDeckId)
    .filter((w) => w.id.startsWith('w-'))
    .slice(0, 5)

  const crossDeckMatch = (() => {
    const normalizedPreview = normalizeImportedTerm(term).term.trim().toLowerCase()
    if (!normalizedPreview || normalizedPreview.length < 2) return null
    const found = storageService
      .getWords()
      .find(
        (w) =>
          w.deckId !== selectedDeckId && w.term.trim().toLowerCase() === normalizedPreview
      )
    if (!found) return null
    const foundDeck = decks.find((d) => d.id === found.deckId)
    return { word: found, deckName: foundDeck?.name || 'kho từ hệ thống' }
  })()

  const handleLookup = async () => {
    const { term: normalizedTerm, partOfSpeech: posFromSuffix } = normalizeImportedTerm(term)
    const cleanTerm = normalizedTerm.trim().toLowerCase()
    if (!cleanTerm) {
      setErrorMsg('Vui lòng nhập từ tiếng Anh trước khi tra cứu.')
      return
    }
    if (normalizedTerm !== term.trim()) {
      setTerm(normalizedTerm)
    }

    setIsLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    setEnglishHint('')

    try {
      const localMatch = storageService
        .getWords()
        .find((w) => w.term.trim().toLowerCase() === cleanTerm)

      const [dictRes, transRes] = await Promise.allSettled([
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanTerm)}`),
        fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanTerm)}&langpair=en|vi`
        ),
      ])

      let nextIpa = ''
      let nextPos =
        posFromSuffix ||
        localMatch?.partOfSpeech ||
        (cleanTerm.includes(' ') ? 'phrase' : 'noun')
      let nextHint = ''
      let nextExample = ''

      if (dictRes.status === 'fulfilled' && dictRes.value.ok) {
        const data = await dictRes.value.json()
        if (Array.isArray(data) && data.length > 0) {
          const posMap: Record<string, string> = {
            adjective: 'adj',
            adverb: 'adv',
            verb: 'verb',
            noun: 'noun',
          }

          for (const entry of data) {
            if (!nextIpa) {
              const ph =
                entry.phonetic ||
                entry.phonetics?.find((p: { text?: string }) => p.text?.trim())?.text?.trim() ||
                ''
              if (ph) {
                nextIpa = ph.startsWith('/') ? ph : `/${ph}/`
              }
            }

            if (Array.isArray(entry.meanings)) {
              for (const m of entry.meanings) {
                if (!posFromSuffix && !localMatch?.partOfSpeech) {
                  if (m.partOfSpeech && nextPos === 'noun' && m.partOfSpeech !== 'noun') {
                    nextPos = posMap[m.partOfSpeech] || nextPos
                  } else if (m.partOfSpeech && entry === data[0] && m === entry.meanings[0]) {
                    nextPos = posMap[m.partOfSpeech] || 'phrase'
                  }
                }

                if (Array.isArray(m.definitions)) {
                  if (!nextHint && m.definitions[0]?.definition) {
                    nextHint = m.definitions[0].definition
                  }
                  if (!nextExample) {
                    const foundEx = m.definitions.find(
                      (d: { example?: string }) => d.example?.trim()
                    )
                    if (foundEx?.example) {
                      nextExample = foundEx.example.trim()
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Prefer our curated 1,144-word dictionary first (clean IPA, accurate Vietnamese meaning & modern example!), falling back to public APIs for brand-new words
      if (localMatch?.ipa) nextIpa = localMatch.ipa
      if (localMatch?.example) nextExample = localMatch.example

      let nextViDef = localMatch?.definition || ''
      if (!nextViDef && transRes.status === 'fulfilled' && transRes.value.ok) {
        const transData = await transRes.value.json()
        const translatedText = transData?.responseData?.translatedText
        if (
          translatedText &&
          typeof translatedText === 'string' &&
          translatedText.trim().toLowerCase() !== cleanTerm
        ) {
          nextViDef = translatedText.trim()
        }
      }

      setIpa(nextIpa)
      setPartOfSpeech(nextPos)
      setEnglishHint(nextHint)
      setExample(nextExample)
      if (nextViDef) {
        setDefinition(nextViDef)
      }

      audioService.speak(cleanTerm)

      const filledParts: string[] = []
      if (nextIpa) filledParts.push('phiên âm')
      if (nextViDef) filledParts.push('nghĩa tiếng Việt')
      if (nextExample) filledParts.push('câu ví dụ')

      if (filledParts.length > 0 || nextHint) {
        setSuccessMsg(
          filledParts.length > 0
            ? `Đã tự động điền ${filledParts.join(', ')}!`
            : 'Đã lấy gợi ý giải nghĩa! Mời bạn nhập nghĩa tiếng Việt.'
        )
      } else {
        setErrorMsg('Chưa tìm thấy từ này trên từ điển tự động. Bạn có thể tự nhập bên dưới.')
      }
    } catch {
      setErrorMsg('Không kết nối được máy chủ từ điển. Mời bạn tự điền thông tin.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const { term: cleanTerm, partOfSpeech: inferredPos } = normalizeImportedTerm(
      term,
      partOfSpeech
    )
    const cleanDef = definition.trim()

    if (!cleanTerm) {
      setErrorMsg('Vui lòng nhập từ tiếng Anh.')
      return
    }

    if (!cleanDef) {
      setErrorMsg('Vui lòng nhập nghĩa tiếng Việt cho từ này.')
      return
    }

    const existingWords = storageService.getWords(selectedDeckId)
    const isDuplicate = existingWords.some(
      (w) => w.term.trim().toLowerCase() === cleanTerm.toLowerCase()
    )

    if (isDuplicate) {
      setErrorMsg(`Từ "${cleanTerm}" đã có sẵn trong bộ từ này rồi!`)
      return
    }

    const newWord: Omit<WordItem, 'id' | 'status' | 'reviewCount'> = {
      deckId: selectedDeckId,
      term: cleanTerm,
      ipa: ipa.trim() || undefined,
      partOfSpeech: inferredPos || partOfSpeech.trim() || undefined,
      definition: cleanDef,
      example: example.trim() || undefined,
    }

    storageService.addWord(newWord)
    audioService.playSuccessChime()

    setTerm('')
    setIpa('')
    setDefinition('')
    setEnglishHint('')
    setExample('')
    setSuccessMsg(`Đã lưu thẻ "${cleanTerm}"! Bạn có thể tiếp tục thêm từ khác.`)

    onWordAdded(selectedDeckId)
  }

  return (
    <div className="w-full max-w-md sm:max-w-xl mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Thêm từ vựng mới</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Gõ từ tiếng Anh và bấm Tra từ để tự động lấy phiên âm, nghĩa gợi ý & câu ví dụ
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
      >
        {/* Deck Select */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Lưu vào bộ từ
          </label>
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>

        {/* English Term + Lookup Button */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Từ hoặc cụm từ tiếng Anh <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !definition.trim() && term.trim()) {
                  e.preventDefault()
                  void handleLookup()
                }
              }}
              placeholder="Ví dụ: resilient, agile..."
              className="flex-1 py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              disabled={isLoading || !term.trim()}
              onClick={() => void handleLookup()}
              className="py-2.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition-transform active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Tra từ</span>
            </button>
          </div>
          {crossDeckMatch && !definition.trim() && (
            <div className="mt-2 p-2 px-2.5 rounded-xl bg-indigo-500/8 dark:bg-indigo-500/12 border border-indigo-500/20 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 truncate">
                Có sẵn trong <strong>{crossDeckMatch.deckName}</strong>: {crossDeckMatch.word.definition}
              </span>
              <button
                type="button"
                onClick={() => {
                  const { term: cleanT, partOfSpeech: suffixPos } = normalizeImportedTerm(term)
                  setTerm(cleanT || crossDeckMatch.word.term)
                  setIpa(crossDeckMatch.word.ipa || '')
                  setPartOfSpeech(suffixPos || crossDeckMatch.word.partOfSpeech || 'noun')
                  setDefinition(crossDeckMatch.word.definition)
                  setExample(crossDeckMatch.word.example || '')
                  audioService.playClick()
                }}
                className="py-1 px-2 rounded-lg bg-indigo-600 text-white font-bold whitespace-nowrap shrink-0 active:scale-95"
              >
                Điền nhanh
              </button>
            </div>
          )}
        </div>

        {/* IPA & Part of Speech */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Phiên âm IPA
              </label>
              {term && (
                <button
                  type="button"
                  onClick={() => audioService.speak(term)}
                  title="Nghe phát âm"
                  className="text-indigo-600 dark:text-indigo-400 hover:opacity-80"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              type="text"
              value={ipa}
              onChange={(e) => setIpa(e.target.value)}
              placeholder="/rɪˈzɪliənt/"
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-sans font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
              Từ loại
            </label>
            <select
              value={partOfSpeech}
              onChange={(e) => setPartOfSpeech(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="verb">Động từ (verb)</option>
              <option value="noun">Danh từ (noun)</option>
              <option value="adj">Tính từ (adj)</option>
              <option value="adv">Trạng từ (adv)</option>
              <option value="phrase">Cụm từ (phrase)</option>
            </select>
          </div>
        </div>

        {/* Vietnamese Definition */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Nghĩa tiếng Việt <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Ví dụ: Kiên cường, bền bỉ"
            className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {englishHint && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-start gap-1 leading-snug">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
              <span>Giải nghĩa gốc: {englishHint}</span>
            </p>
          )}
        </div>

        {/* Example Sentence */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Câu ví dụ ngữ cảnh (Không bắt buộc)
          </label>
          <textarea
            value={example}
            rows={2}
            onChange={(e) => setExample(e.target.value)}
            placeholder="She remained resilient despite facing setbacks..."
            className="w-full py-2 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
            {!term && (
              <button
                type="button"
                onClick={() => onGoToPractice(selectedDeckId)}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Luyện tập ngay bộ từ này</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Save Button */}
        <button
          type="submit"
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Lưu thẻ từ vựng</span>
        </button>
      </form>

      {/* Live Recently Added Custom Words in Selected Deck */}
      {recentCustomWords.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Từ bạn tự thêm gần đây ({recentCustomWords.length})
            </span>
            <button
              type="button"
              onClick={() => onGoToPractice(selectedDeckId)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>Học ngay</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {recentCustomWords.map((rw) => (
              <div
                key={rw.id}
                className="p-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {rw.term}
                    </span>
                    {rw.ipa && (
                      <span className="text-[11px] text-slate-400 font-sans">{rw.ipa}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {rw.definition}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      storageService.toggleWordStar(rw.id)
                      audioService.playClick()
                      setListTick((t) => t + 1)
                      onWordAdded(selectedDeckId)
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      rw.starred
                        ? 'text-amber-500'
                        : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                    }`}
                    title="Đánh dấu sao"
                  >
                    <Star className={`w-3.5 h-3.5 ${rw.starred ? 'fill-amber-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void audioService.speak(rw.term)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    title="Nghe phát âm"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      storageService.deleteWord(rw.id)
                      audioService.playClick()
                      setListTick((t) => t + 1)
                      onWordAdded(selectedDeckId)
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                    title="Xóa thẻ vừa thêm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
