/**
 * API Client — ported from Next.js app/lib/apiClient.tsx
 *
 * Uses openapi-fetch + openapi-react-query for type-safe API calls.
 * Token management delegated to configureApiAuth().
 */

import createClient from "openapi-fetch";
import type { paths } from "./reflector-api";
import createFetchClient from "openapi-react-query";
import { parseNonEmptyString, parseMaybeNonEmptyString } from "./utils";

// ─── URL Resolution ──────────────────────────────────────────────────────────

const resolveApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // Default: assume API is accessed via proxy on same origin.
  // OpenAPI spec paths already include /v1 prefix, so base is just "/".
  return "/";
};

export const API_URL = resolveApiUrl();

/**
 * Derive a WebSocket URL from the API_URL.
 * Handles full URLs (http://host/api, https://host/api) and relative paths (/api).
 */
const deriveWebSocketUrl = (apiUrl: string): string => {
  if (typeof window === "undefined") {
    return "ws://localhost";
  }
  const parsed = new URL(apiUrl, window.location.origin);
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${wsProtocol}//${parsed.host}${pathname}`;
};

const resolveWebSocketUrl = (): string => {
  const raw = import.meta.env.VITE_WEBSOCKET_URL;
  if (!raw || raw === "auto") {
    return deriveWebSocketUrl(API_URL);
  }
  return raw;
};

export const WEBSOCKET_URL = resolveWebSocketUrl();

// ─── Client Setup ────────────────────────────────────────────────────────────

export const client = createClient<paths>({
  baseUrl: API_URL,
});

let currentAuthToken: string | null | undefined = undefined;

// Auth middleware — attaches Bearer token to every request
client.use({
  async onRequest({ request }) {
    const token = currentAuthToken;
    if (token) {
      request.headers.set(
        "Authorization",
        `Bearer ${parseNonEmptyString(token, true, "panic! token is required")}`,
      );
    }
    // Don't override Content-Type for FormData (file uploads set their own boundary)
    if (
      !request.headers.has("Content-Type") &&
      !(request.body instanceof FormData)
    ) {
      request.headers.set("Content-Type", "application/json");
    }
    return request;
  },
});

export const $api = createFetchClient<paths>(client);

/**
 * Set the auth token used for API requests.
 * Called by the AuthProvider whenever auth state changes.
 *
 * Contract: lightweight, idempotent
 *   - undefined = "still loading / unknown"
 *   - null = "definitely logged out"
 *   - string = "access token"
 */
export const configureApiAuth = (token: string | null | undefined) => {
  // Watch only for the initial loading; "reloading" state assumes token
  // presence/absence
  if (token === undefined && currentAuthToken !== undefined) return;
  currentAuthToken = token;
};
