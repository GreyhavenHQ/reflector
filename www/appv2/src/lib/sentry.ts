/**
 * Sentry initialization — client-side only (replaces @sentry/nextjs).
 * Import this file at the very top of main.tsx.
 */

import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0,
    replaysOnErrorSampleRate: 0.0,
    replaysSessionSampleRate: 0.0,
    debug: false,
  });
}

export { Sentry };
