/**
 * AuthProvider — Vite-compatible replacement for next-auth.
 *
 * Communicates with the Express auth proxy server for:
 * - Session checking (GET /auth/session)
 * - Login (POST /auth/login for credentials, GET /auth/login for SSO)
 * - Token refresh (POST /auth/refresh)
 * - Logout (POST /auth/logout)
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { configureApiAuth } from "./apiClient";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

type AuthContextType = (
  | { status: "loading" }
  | { status: "unauthenticated"; error?: string }
  | {
      status: "authenticated";
      accessToken: string;
      accessTokenExpires: number;
      user: AuthUser;
    }
) & {
  signIn: (
    method: "credentials" | "sso",
    credentials?: { email: string; password: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  update: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTH_PROXY_BASE =
  import.meta.env.VITE_AUTH_PROXY_URL || "/auth";

// 4 minutes — must refresh before token expires
const REFRESH_BEFORE_MS = 4 * 60 * 1000;
// Poll every 5 seconds for refresh check
const REFRESH_INTERVAL_MS = 5000;

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "unauthenticated"; error?: string }
    | {
        status: "authenticated";
        accessToken: string;
        accessTokenExpires: number;
        user: AuthUser;
      }
  >({ status: "loading" });

  const refreshTimerRef = useRef<number | null>(null);

  // ── Check session on mount ────────────────────────────────────────────────

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${AUTH_PROXY_BASE}/session`, {
        credentials: "include",
      });

      if (!res.ok) {
        setState({ status: "unauthenticated" });
        configureApiAuth(null);
        return;
      }

      const data = await res.json();

      if (data.status === "authenticated") {
        setState({
          status: "authenticated",
          accessToken: data.accessToken,
          accessTokenExpires: data.accessTokenExpires,
          user: data.user,
        });
        configureApiAuth(data.accessToken);
      } else if (data.status === "refresh_needed") {
        // Try to refresh
        await refreshToken();
      } else {
        setState({ status: "unauthenticated" });
        configureApiAuth(null);
      }
    } catch (error) {
      console.error("Session check failed:", error);
      setState({ status: "unauthenticated" });
      configureApiAuth(null);
    }
  }, []);

  // ── Token refresh ─────────────────────────────────────────────────────────

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch(`${AUTH_PROXY_BASE}/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setState({ status: "unauthenticated" });
        configureApiAuth(null);
        return;
      }

      const data = await res.json();
      setState({
        status: "authenticated",
        accessToken: data.accessToken,
        accessTokenExpires: data.accessTokenExpires,
        user: data.user,
      });
      configureApiAuth(data.accessToken);
    } catch (error) {
      console.error("Token refresh failed:", error);
      setState({ status: "unauthenticated" });
      configureApiAuth(null);
    }
  }, []);

  // ── Auto-refresh polling ─────────────────────────────────────────────────

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (state.status !== "authenticated") {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    const interval = window.setInterval(() => {
      if (state.status !== "authenticated") return;
      const timeLeft = state.accessTokenExpires - Date.now();
      if (timeLeft < REFRESH_BEFORE_MS) {
        refreshToken();
      }
    }, REFRESH_INTERVAL_MS);

    refreshTimerRef.current = interval;
    return () => clearInterval(interval);
  }, [state.status, state.status === "authenticated" ? state.accessTokenExpires : null, refreshToken]);

  // ── Sign in ───────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (
      method: "credentials" | "sso",
      credentials?: { email: string; password: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (method === "sso") {
        // Redirect to Authentik SSO via the auth proxy
        window.location.href = `${AUTH_PROXY_BASE}/login`;
        return { ok: true };
      }

      // Credentials login
      if (!credentials) {
        return { ok: false, error: "Email and password are required" };
      }

      try {
        const res = await fetch(`${AUTH_PROXY_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(credentials),
        });
        console.log(res)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.error || "Invalid credentials" };
        }

        const data = await res.json();
        setState({
          status: "authenticated",
          accessToken: data.accessToken,
          accessTokenExpires: data.accessTokenExpires,
          user: data.user,
        });
        configureApiAuth(data.accessToken);
        return { ok: true };
      } catch (error) {
        console.error("Login error:", error);
        return { ok: false, error: "An unexpected error occurred" };
      }
    },
    [],
  );

  // ── Sign out ──────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    try {
      await fetch(`${AUTH_PROXY_BASE}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }

    setState({ status: "unauthenticated" });
    configureApiAuth(null);
  }, []);

  // ── Update (re-check session) ─────────────────────────────────────────────

  const update = useCallback(async () => {
    await checkSession();
  }, [checkSession]);

  // ── Sync configureApiAuth ────────────────────────────────────────────────

  // Not useEffect — we need the token set ASAP, not on next render
  configureApiAuth(
    state.status === "authenticated"
      ? state.accessToken
      : state.status === "loading"
        ? undefined
        : null,
  );

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signOut,
    update,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
