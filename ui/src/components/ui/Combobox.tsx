import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { I } from '@/components/icons'

type Props = {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  inputStyle?: CSSProperties
}

/**
 * Text input with a clickable dropdown of suggestions. Accepts free text so
 * unknown values still round-trip. The listbox renders in a body-level portal
 * with fixed positioning — otherwise it's clipped or scrolls its parent when
 * used inside a dialog/overflow:hidden container.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  inputStyle,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          ref={inputRef}
          className="rf-input"
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={{
            flex: 1,
            paddingRight: 30,
            minWidth: 0,
            ...(inputStyle ?? {}),
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (disabled) return
            setOpen((v) => !v)
            inputRef.current?.focus()
          }}
          disabled={disabled}
          aria-label="Toggle suggestions"
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: 3,
          }}
        >
          {I.ChevronDown(12)}
        </button>
      </div>

      {open && rect &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              margin: 0,
              padding: 4,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              listStyle: 'none',
              maxHeight: 240,
              overflowY: 'auto',
              zIndex: 9999,
              fontFamily: 'var(--font-sans)',
              fontSize: 12.5,
            }}
          >
            {filtered.length === 0 ? (
              <li
                style={{
                  padding: '6px 10px',
                  color: 'var(--fg-muted)',
                  fontStyle: 'italic',
                }}
              >
                {options.length === 0 ? 'No options available' : 'No matches'}
              </li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(o)
                    setOpen(false)
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: 'var(--fg)',
                    background: o === value ? 'var(--muted)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--muted)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      o === value ? 'var(--muted)' : 'transparent'
                  }}
                >
                  {o}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  )
}
