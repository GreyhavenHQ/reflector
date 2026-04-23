import { I } from '@/components/icons'
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
      style={{
        display: 'grid',
        gridTemplateColumns: horizontal ? '1fr auto 1fr' : '1fr',
        gap: horizontal ? 8 : 14,
        alignItems: 'end',
      }}
    >
      <div>
        <label className="rf-label" htmlFor="rf-source-lang">
          {I.Mic(13)} Spoken language
        </label>
        <select
          id="rf-source-lang"
          className="rf-select"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          style={{ marginTop: 6 }}
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
          style={{
            height: 40,
            width: 40,
            marginBottom: 18,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--muted)',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
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
          className="rf-select"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          style={{ marginTop: 6 }}
        >
          <option value="">— None (same as spoken) —</option>
          {REFLECTOR_LANGS.filter((l) => l.code !== 'auto').map((l) => (
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
