import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { I } from '@/components/icons'
import { SidebarItem } from '@/components/ui/primitives'
import { useAuth } from '@/auth/AuthContext'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
      style={{
        height: 65,
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0' : '0 16px',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {collapsed ? (
        <ReflectorMark size={28} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ReflectorMark size={26} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--fg)',
                }}
              >
                Reflector
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--fg-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 2,
                }}
              >
                by Greyhaven
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            title="Collapse sidebar"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
            }}
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
      style={{ borderTop: '1px solid var(--border)', padding: 12, position: 'relative' }}
    >
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 'calc(100% - 6px)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: 4,
            zIndex: 60,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <MenuRow
            icon={I.Settings(14)}
            label="Settings"
            onClick={() => setOpen(false)}
            disabled
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
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
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: 'var(--gh-off-black)',
            color: 'var(--gh-off-white)',
            fontSize: 11,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {initials(displayName)}
        </span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {user?.email ? 'signed in' : 'local · on-prem'}
          </div>
        </span>
        <span
          style={{
            color: 'var(--fg-muted)',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--dur-fast)',
          }}
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
        color: disabled
          ? 'var(--fg-muted)'
          : danger
            ? 'var(--destructive)'
            : 'var(--fg)',
        opacity: disabled ? 0.5 : 1,
        borderRadius: 'var(--radius-sm)',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
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
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          color: danger ? 'var(--destructive)' : 'var(--fg-muted)',
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
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
