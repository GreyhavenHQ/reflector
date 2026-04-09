import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Sentry } from "./lib/sentry";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/AuthProvider";
import { ErrorProvider } from "./lib/errorContext";
import { RecordingConsentProvider } from "./lib/recordingConsentContext";
import { UserEventsProvider } from "./lib/UserEventsProvider";
import { TopNav } from "./components/layout/TopNav";
import { Footer } from "./components/layout/Footer";
import LoginPage from "./pages/LoginPage";
import WelcomePage from "./pages/WelcomePage";
import RoomsPage from "./pages/RoomsPage";
import RoomMeetingPage from "./pages/RoomMeetingPage";
import TranscriptionsPage from "./pages/TranscriptionsPage";
import SingleTranscriptionPage from "./pages/SingleTranscriptionPage";
import SettingsPage from "./pages/SettingsPage";
import WebinarLandingPage from "./pages/WebinarLandingPage";
import AboutPage from "./pages/AboutPage";
import PrivacyPage from "./pages/PrivacyPage";

// Nav items for TopNav
const NAV_LINKS = [
  { label: "Create", href: "/welcome" },
  { label: "Browse", href: "/transcriptions" },
  { label: "Rooms", href: "/rooms" },
  { label: "Settings", href: "/settings" },
];

// Guard: redirect to / if not authenticated
function RequireAuth() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return auth.status === "authenticated" ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  );
}

// Layout: TopNav only
function TopNavLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <TopNav links={NAV_LINKS} />
      <main className="flex-1 flex flex-col relative">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

// Layout: TopNav + Content
function AppShellLayout() {
  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      <TopNav links={NAV_LINKS} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto flex flex-col relative">
          <div className="flex-1 min-h-0 flex flex-col">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorProvider>
          <RecordingConsentProvider>
            <UserEventsProvider>
              <Sentry.ErrorBoundary
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface">
                    <p>Something went wrong. Please refresh the page.</p>
                  </div>
                }
              >
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<LoginPage />} />
                  <Route path="/webinars/:title" element={<WebinarLandingPage />} />

                  {/* Protected */}
                  <Route element={<RequireAuth />}>
                    <Route element={<TopNavLayout />}>
                      <Route path="/welcome" element={<WelcomePage />} />
                      <Route path="/about" element={<AboutPage />} />
                      <Route path="/privacy" element={<PrivacyPage />} />
                    </Route>
                    <Route element={<AppShellLayout />}>
                      <Route path="/rooms" element={<RoomsPage />} />
                      <Route
                        path="/transcriptions"
                        element={<TranscriptionsPage />}
                      />
                      <Route
                        path="/transcriptions/:id"
                        element={<SingleTranscriptionPage />}
                      />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                    {/* Fullscreen Room Interfaces */}
                    <Route path="/rooms/:roomName" element={<RoomMeetingPage />} />
                    <Route path="/rooms/:roomName/:meetingId" element={<RoomMeetingPage />} />
                  </Route>

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Sentry.ErrorBoundary>
            </UserEventsProvider>
          </RecordingConsentProvider>
        </ErrorProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
