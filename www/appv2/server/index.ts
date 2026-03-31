/**
 * Minimal Express auth proxy server for Authentik SSO.
 *
 * Handles:
 * - OAuth redirect to Authentik
 * - Callback with code exchange
 * - Token refresh
 * - Credentials-based login (fallback)
 * - Session introspection
 */

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { shouldRefreshToken, REFRESH_ACCESS_TOKEN_ERROR } from "./auth";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.VITE_SITE_URL || "http://localhost:3000",
    credentials: true,
  }),
);

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.AUTH_PROXY_PORT) || 3001;
const SERVER_API_URL =
  process.env.SERVER_API_URL || "http://localhost:1250";
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || "authentik";

// Authentik-specific
const AUTHENTIK_CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID || "";
const AUTHENTIK_CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET || "";
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER || "";
const AUTHENTIK_REFRESH_TOKEN_URL =
  process.env.AUTHENTIK_REFRESH_TOKEN_URL || "";

// Cookie settings
const COOKIE_NAME = "reflector_session";
const COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionData {
  accessToken: string;
  accessTokenExpires: number;
  refreshToken?: string;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUserId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${SERVER_API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const userInfo = await response.json();
    return userInfo.sub || null;
  } catch (error) {
    console.error("Error fetching user ID from backend:", error);
    return null;
  }
}

function getRedirectUri(req: express.Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}/auth/callback`;
}

function encodeSession(session: SessionData): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

function decodeSession(cookie: string): SessionData | null {
  try {
    return JSON.parse(Buffer.from(cookie, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /auth/login
 * Redirects to Authentik authorize endpoint (SSO flow)
 */
app.get("/auth/login", (req, res) => {
  if (AUTH_PROVIDER !== "authentik") {
    return res
      .status(400)
      .json({ error: "SSO not configured. Use POST /auth/login instead." });
  }

  if (!AUTHENTIK_ISSUER || !AUTHENTIK_CLIENT_ID) {
    return res.status(500).json({ error: "Authentik not configured" });
  }

  const redirectUri = getRedirectUri(req);
  const authorizeUrl = new URL(
    `${AUTHENTIK_ISSUER}/authorize`,
  );
  authorizeUrl.searchParams.set("client_id", AUTHENTIK_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set(
    "scope",
    "openid email profile offline_access",
  );

  return res.redirect(authorizeUrl.toString());
});

/**
 * GET /auth/callback
 * Handles OAuth callback from Authentik — exchanges code for tokens
 */
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  try {
    const redirectUri = getRedirectUri(req);
    const tokenResponse = await fetch(AUTHENTIK_REFRESH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: AUTHENTIK_CLIENT_ID,
        client_secret: AUTHENTIK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorBody);
      return res.redirect("/?error=token_exchange_failed");
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    const expiresIn = tokens.expires_in;
    const refreshToken = tokens.refresh_token;

    // Resolve user ID from backend
    const userId = await getUserId(accessToken);
    if (!userId) {
      return res.redirect("/?error=user_id_resolution_failed");
    }

    const session: SessionData = {
      accessToken,
      accessTokenExpires: Date.now() + expiresIn * 1000,
      refreshToken,
      user: {
        id: userId,
        email: tokens.email || null,
        name: tokens.name || null,
      },
    };

    res.cookie(COOKIE_NAME, encodeSession(session), COOKIE_OPTIONS);

    // Redirect to the app
    const frontendUrl = process.env.VITE_SITE_URL || "http://localhost:3000";
    return res.redirect(`${frontendUrl}/welcome`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.redirect("/?error=callback_error");
  }
});

/**
 * POST /auth/login
 * Credentials-based login (email + password)
 */
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const response = await fetch(`${SERVER_API_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in;

    // Resolve user ID from backend
    const userId = await getUserId(accessToken);
    if (!userId) {
      return res.status(500).json({ error: "Could not resolve user ID" });
    }

    const session: SessionData = {
      accessToken,
      accessTokenExpires: Date.now() + expiresIn * 1000,
      user: {
        id: userId,
        email,
      },
    };

    res.cookie(COOKIE_NAME, encodeSession(session), COOKIE_OPTIONS);
    return res.json({
      accessToken: session.accessToken,
      accessTokenExpires: session.accessTokenExpires,
      user: session.user,
    });
  } catch (error) {
    console.error("Credentials login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh_token (Authentik only)
 */
app.post("/auth/refresh", async (req, res) => {
  const cookie = req.cookies[COOKIE_NAME];
  const session = cookie ? decodeSession(cookie) : null;

  if (!session) {
    return res.status(401).json({ error: "No active session" });
  }

  if (!session.refreshToken) {
    return res.status(400).json({ error: "No refresh token available" });
  }

  try {
    const response = await fetch(AUTHENTIK_REFRESH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: AUTHENTIK_CLIENT_ID,
        client_secret: AUTHENTIK_CLIENT_SECRET,
        refresh_token: session.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", response.status);
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: REFRESH_ACCESS_TOKEN_ERROR });
    }

    const refreshedTokens = await response.json();

    const updatedSession: SessionData = {
      ...session,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token || session.refreshToken,
    };

    res.cookie(COOKIE_NAME, encodeSession(updatedSession), COOKIE_OPTIONS);
    return res.json({
      accessToken: updatedSession.accessToken,
      accessTokenExpires: updatedSession.accessTokenExpires,
      user: updatedSession.user,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /auth/session
 * Returns current session info or 401
 */
app.get("/auth/session", (req, res) => {
  const cookie = req.cookies[COOKIE_NAME];
  const session = cookie ? decodeSession(cookie) : null;

  if (!session) {
    return res.status(401).json({ status: "unauthenticated" });
  }

  // Check if token is expired
  if (session.accessTokenExpires < Date.now()) {
    // If we have a refresh token, indicate refresh is needed
    if (session.refreshToken) {
      return res.json({
        status: "refresh_needed",
        user: session.user,
      });
    }
    // No refresh token → session is dead
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ status: "unauthenticated" });
  }

  return res.json({
    status: "authenticated",
    accessToken: session.accessToken,
    accessTokenExpires: session.accessTokenExpires,
    user: session.user,
  });
});

/**
 * POST /auth/logout
 * Clears session cookie
 */
app.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.json({ status: "logged_out" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Auth proxy server running on http://localhost:${PORT}`);
  console.log(`  AUTH_PROVIDER: ${AUTH_PROVIDER}`);
  console.log(`  SERVER_API_URL: ${SERVER_API_URL}`);
  if (AUTH_PROVIDER === "authentik") {
    console.log(`  AUTHENTIK_ISSUER: ${AUTHENTIK_ISSUER || "(not set)"}`);
  }
});
