import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import { Toaster } from 'sonner'
import { queryClient } from '@/api/queryClient'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { BrowsePage } from '@/pages/BrowsePage'
import { RoomsPage } from '@/pages/RoomsPage'
import { TranscriptPage } from '@/pages/TranscriptPage'
import { SharedTranscriptPage } from '@/pages/SharedTranscriptPage'
import { ApiKeysPage } from '@/pages/ApiKeysPage'
import { UploadPage } from '@/pages/UploadPage'
import { RecordPage } from '@/pages/RecordPage'
import { RoomPage } from '@/pages/RoomPage'
import { LoggedOutPage } from '@/pages/LoggedOut'
import { LoginForm } from '@/pages/LoginForm'
import { AuthCallbackPage } from '@/pages/AuthCallback'

function TranscriptRedirect() {
  const { id } = useParams()
  return <Navigate to={`/transcripts/${id}`} replace />
}

// Slugs we use for our own top-level pages. A user-created room with one
// of these names would get shadowed by the explicit routes above — rather
// than silently opening the wrong page, bounce back to /browse and let
// them fix the name. Backend-side name validation should reject these on
// creation; this is defence-in-depth.
const RESERVED_ROOM_SLUGS = new Set([
  'login',
  'welcome',
  'auth',
  'browse',
  'rooms',
  'transcripts',
  'transcript',
  'shared',
  'settings',
])

function RoomOrReserved() {
  const { roomName } = useParams<{ roomName: string }>()
  if (!roomName || RESERVED_ROOM_SLUGS.has(roomName.toLowerCase())) {
    return <Navigate to="/browse" replace />
  }
  return <RoomPage />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/v2">
        <NuqsAdapter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginForm />} />
              <Route path="/welcome" element={<LoggedOutPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/auth/silent-renew" element={<AuthCallbackPage />} />
              <Route path="/" element={<Navigate to="/browse" replace />} />
              <Route
                path="/browse"
                element={
                  <RequireAuth>
                    <BrowsePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/rooms"
                element={
                  <RequireAuth>
                    <RoomsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/transcripts/:id"
                element={
                  <RequireAuth>
                    <TranscriptPage />
                  </RequireAuth>
                }
              />
              <Route path="/transcript/:id" element={<TranscriptRedirect />} />
              <Route
                path="/transcripts/:id/upload"
                element={
                  <RequireAuth>
                    <UploadPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/transcripts/:id/record"
                element={
                  <RequireAuth>
                    <RecordPage />
                  </RequireAuth>
                }
              />
              <Route path="/shared/:id" element={<SharedTranscriptPage />} />
              <Route
                path="/settings"
                element={<Navigate to="/settings/api-keys" replace />}
              />
              <Route
                path="/settings/api-keys"
                element={
                  <RequireAuth>
                    <ApiKeysPage />
                  </RequireAuth>
                }
              />
              <Route path="/:roomName" element={<RoomOrReserved />} />
              <Route path="/:roomName/:meetingId" element={<RoomOrReserved />} />
              <Route path="*" element={<Navigate to="/browse" replace />} />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: 'var(--card)',
                  color: 'var(--fg)',
                  border: '1px solid var(--border)',
                },
              }}
            />
          </AuthProvider>
        </NuqsAdapter>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
