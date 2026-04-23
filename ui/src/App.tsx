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
import { LoggedOutPage } from '@/pages/LoggedOut'
import { LoginForm } from '@/pages/LoginForm'
import { AuthCallbackPage } from '@/pages/AuthCallback'

function TranscriptRedirect() {
  const { id } = useParams()
  return <Navigate to={`/transcripts/${id}`} replace />
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
