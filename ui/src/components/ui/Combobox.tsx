import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { I } from '@/components/icons'
import { cn } from '@/lib/utils'

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
    <div ref={wrapRef} className="relative w-full">
      <div className="relative flex">
        <input
          ref={inputRef}
          className="rf-input flex-1 pr-[30px] min-w-0"
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={inputStyle}
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
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-[22px] h-[22px] border-none bg-transparent text-fg-muted rounded-[3px]',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {I.ChevronDown(12)}
        </button>
      </div>

      {open && rect &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            className="m-0 p-1 bg-card border border-border rounded-md shadow-md list-none max-h-60 overflow-y-auto font-sans text-[12.5px]"
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              zIndex: 9999,
            }}
          >
            {filtered.length === 0 ? (
              <li className="px-2.5 py-1.5 text-fg-muted italic">
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
                  className={cn(
                    'px-2.5 py-1.5 rounded-sm cursor-pointer text-fg',
                    o === value ? 'bg-muted' : 'bg-transparent',
                  )}
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
