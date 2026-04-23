import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { I } from '@/components/icons'

export type TranscriptStatus = 'live' | 'ended' | 'processing' | 'uploading' | 'failed' | 'idle'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'icon' | 'iconSm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  style,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const base: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all var(--dur-normal) var(--ease-default)',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  }
  const sizes: Record<ButtonSize, CSSProperties> = {
    xs: { height: 26, padding: '0 8px', fontSize: 12 },
    sm: { height: 30, padding: '0 10px', fontSize: 13 },
    md: { height: 36, padding: '0 14px', fontSize: 14 },
    icon: { height: 32, width: 32, padding: 0 },
    iconSm: { height: 28, width: 28, padding: 0 },
  }
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--primary-fg)', boxShadow: 'var(--shadow-xs)' },
    secondary: { background: 'var(--secondary)', color: 'var(--secondary-fg)', borderColor: 'var(--border)' },
    outline: { background: 'var(--card)', color: 'var(--fg)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-xs)' },
    ghost: { background: 'transparent', color: 'var(--fg-muted)' },
    danger: { background: 'transparent', color: 'var(--destructive)' },
  }
  return (
    <button
      ref={ref}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function StatusDot({ status, size = 8 }: { status: TranscriptStatus; size?: number }) {
  const map: Record<TranscriptStatus, string> = {
    live: 'var(--status-live)',
    ended: 'var(--status-ok)',
    processing: 'var(--status-processing)',
    uploading: 'var(--status-processing)',
    failed: 'var(--status-failed)',
    idle: 'var(--status-idle)',
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        background: map[status] ?? map.idle,
        flexShrink: 0,
      }}
    />
  )
}

type BadgeStyle = { color: string; bg: string; bd: string }

export function StatusBadge({ status }: { status: TranscriptStatus }) {
  const labels: Record<TranscriptStatus, string> = {
    live: 'Live',
    ended: 'Done',
    processing: 'Processing',
    uploading: 'Uploading',
    failed: 'Failed',
    idle: 'Idle',
  }
  const styles: Partial<Record<TranscriptStatus, BadgeStyle>> = {
    live: { color: 'var(--status-live)', bg: 'rgba(217,94,42,0.08)', bd: 'rgba(217,94,42,0.25)' },
    processing: {
      color: 'var(--status-processing)',
      bg: 'color-mix(in oklch, var(--status-processing) 10%, transparent)',
      bd: 'color-mix(in oklch, var(--status-processing) 30%, transparent)',
    },
    uploading: {
      color: 'var(--status-processing)',
      bg: 'color-mix(in oklch, var(--status-processing) 10%, transparent)',
      bd: 'color-mix(in oklch, var(--status-processing) 30%, transparent)',
    },
    failed: {
      color: 'var(--destructive)',
      bg: 'color-mix(in oklch, var(--destructive) 10%, transparent)',
      bd: 'color-mix(in oklch, var(--destructive) 25%, transparent)',
    },
    ended: { color: 'var(--fg-muted)', bg: 'var(--muted)', bd: 'var(--border)' },
  }
  const s = styles[status] ?? styles.ended!
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '1px 8px',
        height: 20,
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 500,
        color: s.color,
        background: s.bg,
        border: '1px solid',
        borderColor: s.bd,
        borderRadius: 9999,
        lineHeight: 1,
      }}
    >
      <StatusDot status={status} size={6} />
      {labels[status] ?? status}
    </span>
  )
}

export function Waveform({
  seed = 1,
  bars = 22,
  color = 'var(--fg-muted)',
  active = false,
}: {
  seed?: number
  bars?: number
  color?: string
  active?: boolean
}) {
  const heights = useMemo(() => {
    const out: number[] = []
    let s = seed * 9301
    for (let i = 0; i < bars; i++) {
      s = (s * 9301 + 49297) % 233280
      const r = s / 233280
      const env = 0.35 + 0.65 * Math.sin((i / bars) * Math.PI)
      out.push(Math.max(3, Math.round(env * 24 * (0.4 + r * 0.9))))
    }
    return out
  }, [seed, bars])
  return (
    <div className="rf-wave" style={{ color, opacity: active ? 1 : 0.75 }}>
      {heights.map((h, i) => (
        <span key={i} style={{ height: h, opacity: active && i < bars * 0.6 ? 1 : undefined }} />
      ))}
    </div>
  )
}

export function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="rf-tag">
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            margin: 0,
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          {I.Close(10)}
        </button>
      )}
    </span>
  )
}

export function SidebarItem({
  icon,
  label,
  count,
  active,
  onClick,
  dot,
  kbd,
  indent = false,
}: {
  icon?: ReactNode
  label: ReactNode
  count?: number | null
  active?: boolean
  onClick?: () => void
  dot?: string
  kbd?: string
  indent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: indent ? '6px 10px 6px 30px' : '7px 10px',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        background: active ? 'var(--card)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--border)' : 'transparent',
        boxShadow: active ? 'var(--shadow-xs)' : 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: -11,
            top: 6,
            bottom: 6,
            width: 2,
            background: 'var(--primary)',
            borderRadius: 2,
          }}
        />
      )}
      {icon && (
        <span
          style={{
            display: 'inline-flex',
            color: active ? 'var(--primary)' : 'var(--fg-muted)',
            opacity: active ? 1 : 0.75,
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot }} />}
      {count != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            fontFamily: 'var(--font-mono)',
            color: active ? 'var(--fg)' : 'var(--fg-muted)',
          }}
        >
          {count}
        </span>
      )}
      {kbd && count == null && <span className="rf-kbd">{kbd}</span>}
    </button>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        padding: '0 10px 6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--fg-muted)',
      }}
    >
      <span>{children}</span>
      {action}
    </div>
  )
}

export function ProgressRow({
  stage,
  progress,
  eta,
}: {
  stage: string
  progress?: number | null
  eta?: string | null
}) {
  const pct = Math.round((progress ?? 0) * 100)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        marginTop: 2,
        background: 'color-mix(in oklch, var(--status-processing) 6%, var(--card))',
        border: '1px solid color-mix(in oklch, var(--status-processing) 22%, transparent)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
      }}
    >
      <span
        className="rf-spinner"
        style={{
          width: 12,
          height: 12,
          borderRadius: 9999,
          flexShrink: 0,
          border: '2px solid color-mix(in oklch, var(--status-processing) 25%, transparent)',
          borderTopColor: 'var(--status-processing)',
          animation: 'rfSpin 0.9s linear infinite',
        }}
      />
      <span style={{ color: 'var(--status-processing)', fontWeight: 600 }}>{stage}…</span>
      <span
        style={{
          flex: 1,
          height: 4,
          background: 'color-mix(in oklch, var(--status-processing) 15%, transparent)',
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${pct}%`,
            height: '100%',
            background: 'var(--status-processing)',
            transition: 'width 400ms var(--ease-default)',
          }}
        />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--status-processing)',
          minWidth: 32,
          textAlign: 'right',
        }}
      >
        {pct}%
      </span>
      {eta && (
        <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {eta}
        </span>
      )}
    </div>
  )
}

export type RowMenuItem =
  | { separator: true }
  | {
      label: string
      icon?: ReactNode
      danger?: boolean
      disabled?: boolean
      kbd?: string
      onClick?: () => void
    }

type RowMenuProps = {
  items?: RowMenuItem[]
  onClose?: () => void
  /** Bounding rect of the trigger button; used to position the floating menu. */
  anchor?: DOMRect | null
}

const MENU_WIDTH = 200
const MENU_GAP = 4

export function RowMenu({ items = [], onClose, anchor }: RowMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>(() =>
    computePos(anchor, 0),
  )

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    setPos(computePos(anchor, height))
  }, [anchor, items.length])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    const onScrollOrResize = () => onClose?.()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: MENU_WIDTH,
        zIndex: 1000,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 4,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {items.map((it, i) => {
        if ('separator' in it) {
          return (
            <div
              key={i}
              style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }}
            />
          )
        }
        const danger = it.danger
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={(e) => {
              e.stopPropagation()
              it.onClick?.()
              onClose?.()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '7px 10px',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              color: it.disabled
                ? 'var(--fg-muted)'
                : danger
                  ? 'var(--destructive)'
                  : 'var(--fg)',
              opacity: it.disabled ? 0.5 : 1,
              borderRadius: 'var(--radius-sm)',
              textAlign: 'left',
              cursor: it.disabled ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!it.disabled) {
                e.currentTarget.style.background = danger
                  ? 'color-mix(in oklch, var(--destructive) 10%, transparent)'
                  : 'var(--muted)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {it.icon && (
              <span
                style={{
                  display: 'inline-flex',
                  flexShrink: 0,
                  color: danger ? 'var(--destructive)' : 'var(--fg-muted)',
                }}
              >
                {it.icon}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {it.kbd && (
              <span className="rf-kbd" style={{ fontSize: 10 }}>
                {it.kbd}
              </span>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

function computePos(anchor: DOMRect | null | undefined, menuHeight: number) {
  if (!anchor) return { top: 0, left: 0 }
  const vh = window.innerHeight
  const vw = window.innerWidth
  let top = anchor.bottom + MENU_GAP
  if (menuHeight > 0 && top + menuHeight > vh - 8) {
    // Flip above the trigger when there's no room below.
    top = Math.max(8, anchor.top - MENU_GAP - menuHeight)
  }
  let left = anchor.right - MENU_WIDTH
  if (left < 8) left = 8
  if (left + MENU_WIDTH > vw - 8) left = vw - MENU_WIDTH - 8
  return { top, left }
}

export function RowMenuTrigger({
  items,
  label = 'Options',
}: {
  items: RowMenuItem[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <span style={{ display: 'inline-flex' }}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="iconSm"
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(triggerRef.current?.getBoundingClientRect() ?? null)
          setOpen((v) => !v)
        }}
      >
        {I.More(16)}
      </Button>
      {open && (
        <RowMenu items={items} anchor={anchor} onClose={() => setOpen(false)} />
      )}
    </span>
  )
}
