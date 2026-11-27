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
import { cn } from '@/lib/utils'

export type TranscriptStatus = 'live' | 'ended' | 'processing' | 'uploading' | 'failed' | 'idle'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'icon' | 'iconSm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-medium whitespace-nowrap no-underline rounded-md border border-transparent cursor-pointer transition-all duration-[var(--dur-normal)] ease-[var(--ease-default)]'

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-[26px] px-2 text-xs',
  sm: 'h-[30px] px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  icon: 'h-8 w-8 p-0',
  iconSm: 'h-7 w-7 p-0',
}

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-xs',
  secondary: 'bg-secondary text-secondary-fg border-border',
  outline: 'bg-card text-fg border-border shadow-xs',
  ghost: 'bg-transparent text-fg-muted',
  danger: 'bg-transparent text-destructive',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
      {...rest}
    >
      {children}
    </button>
  )
}

const STATUS_DOT_BG: Record<TranscriptStatus, string> = {
  live: 'bg-status-live',
  ended: 'bg-status-ok',
  processing: 'bg-status-processing',
  uploading: 'bg-status-processing',
  failed: 'bg-status-failed',
  idle: 'bg-status-idle',
}

export function StatusDot({ status, size = 8 }: { status: TranscriptStatus; size?: number }) {
  // Dimensions are runtime-driven (callers pass arbitrary px), so size stays inline.
  return (
    <span
      className={cn('inline-block rounded-full shrink-0', STATUS_DOT_BG[status] ?? STATUS_DOT_BG.idle)}
      style={{ width: size, height: size }}
    />
  )
}

const STATUS_BADGE_VARIANT: Record<TranscriptStatus, string> = {
  live: 'text-status-live bg-[var(--reflector-accent-tint)] border-[color-mix(in_oklch,var(--status-live)_25%,transparent)]',
  processing:
    'text-status-processing bg-[color-mix(in_oklch,var(--status-processing)_10%,transparent)] border-[color-mix(in_oklch,var(--status-processing)_30%,transparent)]',
  uploading:
    'text-status-processing bg-[color-mix(in_oklch,var(--status-processing)_10%,transparent)] border-[color-mix(in_oklch,var(--status-processing)_30%,transparent)]',
  failed:
    'text-destructive bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] border-[color-mix(in_oklch,var(--destructive)_25%,transparent)]',
  ended: 'text-fg-muted bg-muted border-border',
  idle: 'text-fg-muted bg-muted border-border',
}

const STATUS_LABEL: Record<TranscriptStatus, string> = {
  live: 'Live',
  ended: 'Done',
  processing: 'Processing',
  uploading: 'Uploading',
  failed: 'Failed',
  idle: 'Idle',
}

export function StatusBadge({ status }: { status: TranscriptStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-px h-5 rounded-full border font-sans text-[11px] font-medium leading-none',
        STATUS_BADGE_VARIANT[status] ?? STATUS_BADGE_VARIANT.ended,
      )}
    >
      <StatusDot status={status} size={6} />
      {STATUS_LABEL[status] ?? status}
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
  // .rf-wave (defined in index.css) lays out the bars; `color` is caller-supplied
  // and height is computed per-bar — both stay inline.
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
          className="inline-flex border-none bg-transparent text-fg-muted p-0 m-0 cursor-pointer"
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
      className={cn(
        'relative flex items-center gap-2.5 w-full font-sans text-[13px] rounded-md cursor-pointer text-left border',
        indent ? 'py-1.5 pr-2.5 pl-[30px]' : 'px-2.5 py-[7px]',
        active
          ? 'text-fg bg-card border-border shadow-xs font-semibold'
          : 'text-fg-muted bg-transparent border-transparent font-medium',
      )}
    >
      {active && (
        <span className="absolute -left-[11px] top-1.5 bottom-1.5 w-0.5 bg-primary rounded-[2px]" />
      )}
      {icon && (
        <span
          className={cn('inline-flex', active ? 'text-primary opacity-100' : 'text-fg-muted opacity-75')}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: dot }}
        />
      )}
      {count != null && (
        <span
          className={cn(
            'text-[10px] font-medium font-mono',
            active ? 'text-fg' : 'text-fg-muted',
          )}
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
    <div className="flex items-center justify-between px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-fg-muted">
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
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-1.5 mt-0.5 rounded-sm font-sans text-[11.5px] border',
        'bg-[color-mix(in_oklch,var(--status-processing)_6%,var(--card))]',
        'border-[color-mix(in_oklch,var(--status-processing)_22%,transparent)]',
      )}
    >
      <span
        className={cn(
          'rf-spinner w-3 h-3 rounded-full shrink-0 border-2 border-t-status-processing',
          'border-[color-mix(in_oklch,var(--status-processing)_25%,transparent)]',
          'border-t-status-processing animate-[rfSpin_0.9s_linear_infinite]',
        )}
      />
      <span className="text-status-processing font-semibold">{stage}…</span>
      <span className="relative flex-1 h-1 rounded-[2px] overflow-hidden bg-[color-mix(in_oklch,var(--status-processing)_15%,transparent)]">
        <span
          className="block h-full bg-status-processing transition-[width] duration-[400ms] ease-[var(--ease-default)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-[11px] font-semibold text-status-processing min-w-[32px] text-right">
        {pct}%
      </span>
      {eta && <span className="text-fg-muted font-mono text-[11px]">{eta}</span>}
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

  // Position values are computed at runtime from the trigger rect; min-width is
  // a constant the layout math depends on, so both stay inline.
  const positionStyle: CSSProperties = {
    top: pos.top,
    left: pos.left,
    minWidth: MENU_WIDTH,
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[1000] p-1 bg-card border border-border rounded-md shadow-md font-sans"
      style={positionStyle}
    >
      {items.map((it, i) => {
        if ('separator' in it) {
          return <div key={i} className="h-px bg-border mx-0.5 my-1" />
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
            className={cn(
              'flex items-center gap-2.5 w-full px-2.5 py-[7px] border-none bg-transparent rounded-sm font-sans text-[13px] text-left',
              it.disabled
                ? 'text-fg-muted opacity-50 cursor-not-allowed'
                : cn(
                    danger
                      ? 'text-destructive hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]'
                      : 'text-fg hover:bg-muted',
                    'cursor-pointer',
                  ),
            )}
          >
            {it.icon && (
              <span
                className={cn(
                  'inline-flex shrink-0',
                  danger ? 'text-destructive' : 'text-fg-muted',
                )}
              >
                {it.icon}
              </span>
            )}
            <span className="flex-1 min-w-0">{it.label}</span>
            {it.kbd && <span className="rf-kbd text-[10px]">{it.kbd}</span>}
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
    <span className="inline-flex">
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
