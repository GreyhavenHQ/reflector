import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

type Props = {
  roomName: string
}

/**
 * Slim top strip shown to unauthenticated visitors on a room page so
 * calendar-invite guests have a clear "you're entering as a guest" cue
 * and a path to sign in. Authenticated users see nothing.
 */
export function GuestBanner({ roomName }: Props) {
  const { authenticated, loading } = useAuth()
  if (loading || authenticated) return null
  return (
    <div
      role="banner"
      className="fixed top-0 left-0 right-0 z-[100] h-12 flex items-center justify-between px-[18px] bg-card border-b border-border shadow-xs font-sans"
    >
      <span className="text-sm text-fg-muted">
        Joining{' '}
        <span className="text-fg font-serif">{roomName}</span>{' '}
        as a guest
      </span>
      <Link
        to="/welcome"
        state={{ from: `/${roomName}` }}
        className="text-[13px] text-primary no-underline font-medium"
      >
        Sign in
      </Link>
    </div>
  )
}
