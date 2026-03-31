/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WEBSOCKET_URL?: string;
  readonly VITE_AUTH_PROXY_URL?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_FEATURE_REQUIRE_LOGIN?: string;
  readonly VITE_FEATURE_PRIVACY?: string;
  readonly VITE_FEATURE_BROWSE?: string;
  readonly VITE_FEATURE_SEND_TO_ZULIP?: string;
  readonly VITE_FEATURE_ROOMS?: string;
  readonly VITE_FEATURE_EMAIL_TRANSCRIPT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
