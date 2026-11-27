import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { I } from '@/components/icons'
import { SidebarItem } from '@/components/ui/primitives'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { ReflectorMark } from './ReflectorMark'

/**
 * Top-level nav shared by AppSidebar and RoomsSidebar — sits above the
 * filter/context sections, below the New Recording button.
 */
export function PrimaryNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const onTranscripts =
    location.pathname === '/' ||
    location.pathname.startsWith('/browse') ||
    location.pathname.startsWith('/transcripts') ||
    location.pathname.startsWith('/transcript/')
  const onRooms = location.pathname.startsWith('/rooms')
  return (
    <div className="flex flex-col gap-px">
      <SidebarItem
        icon={I.Inbox(15)}
        label="Transcripts"
        active={onTranscripts}
        onClick={() => navigate('/browse')}
      />
      <SidebarItem
        icon={I.Door(15)}
        label="Rooms"
        active={onRooms}
        onClick={() => navigate('/rooms')}
      />
    </div>
  )
}

export function BrandHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'h-[65px] flex items-center border-b border-border',
        collapsed ? 'px-0 justify-center' : 'px-4 justify-between',
      )}
    >
      {collapsed ? (
        <ReflectorMark size={28} />
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <ReflectorMark size={26} />
            <div className="flex flex-col leading-none">
              <span className="font-serif text-[17px] font-semibold tracking-[-0.01em] text-fg">
                Reflector
              </span>
              <span className="text-[10px] text-fg-muted font-mono mt-0.5">
                by Greyhaven
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            title="Collapse sidebar"
            className="border-none bg-transparent text-fg-muted cursor-pointer p-1 rounded-sm inline-flex"
          >
            {I.ChevronLeft(14)}
          </button>
        </>
      )}
    </div>
  )
}

export function UserChip({
  user,
}: {
  user: { name?: string | null; email?: string | null } | null | undefined
}) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const displayName = user?.name || user?.email || 'Signed in'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  return (
    <div
      ref={wrapperRef}
      className="border-t border-border p-3 relative"
    >
      {open && (
        <div
          role="menu"
          className="absolute left-3 right-3 bottom-[calc(100%-6px)] bg-card border border-border rounded-md shadow-md p-1 z-[60] font-sans"
        >
          <MenuRow
            icon={I.Settings(14)}
            label="Settings"
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
          />
          <div className="h-px bg-border mx-0.5 my-1" />
          <MenuRow
            icon={I.ExternalLink(14)}
            label="Log out"
            danger
            onClick={() => {
              setOpen(false)
              void logout()
            }}
          />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-card border border-border rounded-md cursor-pointer font-sans shadow-xs"
      >
        <span
          className="w-7 h-7 rounded-full text-[11px] font-semibold inline-flex items-center justify-center"
          style={{ background: 'var(--gh-off-black)', color: 'var(--gh-off-white)' }}
        >
          {initials(displayName)}
        </span>
        <span className="flex-1 text-left min-w-0">
          <div className="text-[13px] font-medium text-fg whitespace-nowrap overflow-hidden text-ellipsis">
            {displayName}
          </div>
          <div className="text-[10px] text-fg-muted font-mono">
            {user?.email ? 'signed in' : 'local · on-prem'}
          </div>
        </span>
        <span
          className={cn(
            'text-fg-muted transition-transform duration-[var(--dur-fast)]',
            open && 'rotate-180',
          )}
        >
          {I.ChevronDown(14)}
        </span>
      </button>
    </div>
  )
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2.5 w-full px-2.5 py-[7px] border-none bg-transparent text-[13px] font-sans rounded-sm text-left',
        disabled
          ? 'text-fg-muted opacity-50 cursor-not-allowed'
          : cn(danger ? 'text-destructive' : 'text-fg', 'opacity-100 cursor-pointer'),
      )}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = danger
          ? 'color-mix(in oklch, var(--destructive) 10%, transparent)'
          : 'var(--muted)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        className={cn(
          'inline-flex shrink-0',
          danger ? 'text-destructive' : 'text-fg-muted',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">{label}</span>
    </button>
  )
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'R'
  )
}

export const sidebarAsideStyle = (collapsed: boolean) =>
  ({
    width: collapsed ? 64 : 252,
    transition: 'width var(--dur-normal) var(--ease-default)',
    background: 'var(--secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    fontFamily: 'var(--font-sans)',
  }) as const
