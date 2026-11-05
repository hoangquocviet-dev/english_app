import { AlertCircle, Check, Loader2, Plus, Search, Volume2 } from 'lucide-react'
import { useState } from 'react'
import type { Deck, WordItem } from '../../types'
import { audioService } from '../../utils/audio'
import { storageService } from '../../utils/storage'

interface AddWordViewProps {
  decks: Deck[]
  activeDeckId: string
  onWordAdded: () => void
}

export function AddWordView({ decks, activeDeckId, onWordAdded }: AddWordViewProps) {
  const [selectedDeckId, setSelectedDeckId] = useState(activeDeckId)
  const [term, setTerm] = useState('')
  const [ipa, setIpa] = useState('')
  const [partOfSpeech, setPartOfSpeech] = useState('noun')
  const [definition, setDefinition] = useState('')
  const [example, setExample] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Look up Free Dictionary API
  const handleLookup = async () => {
    const cleanTerm = term.trim().toLowerCase()
    if (!cleanTerm) {
      setErrorMsg('Vui lòng nhập từ tiếng Anh trước khi tra cứu.')
      return
    }

    setIsLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanTerm)}`
      )

      if (!response.ok) {
        if (response.status === 404) {
          setErrorMsg('Từ này chưa có trong từ điển mở. Bạn có thể tự điền phiên âm và nghĩa bên dưới.')
        } else {
          setErrorMsg('Không thể kết nối đến từ điển mở. Mời bạn tự điền thông tin.')
        }
        setIsLoading(false)
        return
      }

      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0]

        // Extract IPA
        const phonetic =
          entry.phonetic ||
          entry.phonetics?.find((p: { text?: string }) => p.text)?.text ||
          ''
        if (phonetic) {
          setIpa(phonetic.startsWith('/') ? phonetic : `/${phonetic}/`)
        }

        // Extract Part of Speech & Example
        if (entry.meanings && entry.meanings.length > 0) {
          const firstMeaning = entry.meanings[0]
          if (firstMeaning.partOfSpeech) {
            setPartOfSpeech(firstMeaning.partOfSpeech)
          }

          const defWithExample = firstMeaning.definitions?.find((d: { example?: string }) => d.example)
          if (defWithExample?.example) {
            setExample(defWithExample.example)
          }
        }

        audioService.speak(cleanTerm)
        setSuccessMsg('Đã tra cứu xong phiên âm và ví dụ! Mời bạn nhập nghĩa tiếng Việt.')
      }
    } catch {
      setErrorMsg('Lỗi mạng khi tra cứu từ điển. Vui lòng tự nhập thông tin.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const cleanTerm = term.trim()
    const cleanDef = definition.trim()

    if (!cleanTerm) {
      setErrorMsg('Vui lòng nhập từ tiếng Anh.')
      return
    }

    if (!cleanDef) {
      setErrorMsg('Vui lòng nhập nghĩa tiếng Việt cho từ này.')
      return
    }

    // Duplicate check
    const existingWords = storageService.getWords(selectedDeckId)
    const isDuplicate = existingWords.some(
      (w) => w.term.trim().toLowerCase() === cleanTerm.toLowerCase()
    )

    if (isDuplicate) {
      setErrorMsg(`Từ "${cleanTerm}" đã tồn tại trong bộ từ này rồi!`)
      return
    }

    const newWord: Omit<WordItem, 'id' | 'status' | 'reviewCount'> = {
      deckId: selectedDeckId,
      term: cleanTerm,
      ipa: ipa.trim() || undefined,
      partOfSpeech: partOfSpeech.trim() || undefined,
      definition: cleanDef,
      example: example.trim() || undefined,
    }

    storageService.addWord(newWord)
    audioService.playSuccessChime()

    // Reset form
    setTerm('')
    setIpa('')
    setDefinition('')
    setExample('')
    setSuccessMsg(`Đã lưu thành công thẻ từ "${cleanTerm}"!`)

    onWordAdded()
  }

  return (
    <div className="w-full max-w-md mx-auto px-3.5 py-4 space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Thêm từ vựng mới
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tra cứu tự động hoặc tự điền từ vựng theo nhu cầu học tập
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
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
            Từ tiếng Anh <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Ví dụ: retrieve, compile..."
              className="flex-1 py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              disabled={isLoading || !term.trim()}
              onClick={handleLookup}
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
              placeholder="/rɪˈtriːv/"
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* Vietnamese Definition (Mandatory per B1) */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Nghĩa tiếng Việt <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Ví dụ: Truy xuất, lấy lại dữ liệu"
            className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Example Sentence */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
            Câu ví dụ (Không bắt buộc)
          </label>
          <textarea
            value={example}
            rows={2}
            onChange={(e) => setExample(e.target.value)}
            placeholder="We need to retrieve the user record..."
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
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
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
    </div>
  )
}
