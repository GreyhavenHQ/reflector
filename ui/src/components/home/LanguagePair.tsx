import { I } from '@/components/icons'
import { cn } from '@/lib/utils'
import { REFLECTOR_LANGS } from '@/lib/types'

type Props = {
  sourceLang: string
  setSourceLang: (v: string) => void
  targetLang: string
  setTargetLang: (v: string) => void
  horizontal?: boolean
}

export function LanguagePair({
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  horizontal,
}: Props) {
  return (
    <div
      className={cn(
        'grid items-end',
        horizontal ? 'grid-cols-[1fr_auto_1fr] gap-2' : 'grid-cols-1 gap-3.5',
      )}
    >
      <div>
        <label className="rf-label" htmlFor="rf-source-lang">
          {I.Mic(13)} Spoken language
        </label>
        <select
          id="rf-source-lang"
          className="rf-select mt-1.5"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
        >
          {REFLECTOR_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
        <div className="rf-hint">Detected from the audio if set to Auto.</div>
      </div>

      {horizontal && (
        <button
          type="button"
          onClick={() => {
            const a = sourceLang
            setSourceLang(targetLang)
            setTargetLang(a)
          }}
          title="Swap languages"
          className="h-10 w-10 mb-[18px] border border-border rounded-md bg-muted cursor-pointer text-fg-muted inline-flex items-center justify-center"
        >
          {I.Swap(16)}
        </button>
      )}

      <div>
        <label className="rf-label" htmlFor="rf-target-lang">
          {I.Globe(13)} Translate to
        </label>
        <select
          id="rf-target-lang"
          className="rf-select mt-1.5"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
        >
          <option value="">— None (same as spoken) —</option>
          {REFLECTOR_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
        <div className="rf-hint">Leave blank to skip translation.</div>
      </div>
    </div>
  )
}
