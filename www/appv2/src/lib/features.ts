/**
 * Feature flag system — ported from Next.js app/lib/features.ts
 * Uses Vite env vars instead of server-side data-env injection.
 */

export const FEATURES = [
  "requireLogin",
  "privacy",
  "browse",
  "sendToZulip",
  "rooms",
  "emailTranscript",
] as const;

export type FeatureName = (typeof FEATURES)[number];

export type Features = Readonly<Record<FeatureName, boolean>>;

export const DEFAULT_FEATURES: Features = {
  requireLogin: true,
  privacy: true,
  browse: true,
  sendToZulip: true,
  rooms: true,
  emailTranscript: false,
} as const;

const FEATURE_TO_ENV: Record<FeatureName, string> = {
  requireLogin: "VITE_FEATURE_REQUIRE_LOGIN",
  privacy: "VITE_FEATURE_PRIVACY",
  browse: "VITE_FEATURE_BROWSE",
  sendToZulip: "VITE_FEATURE_SEND_TO_ZULIP",
  rooms: "VITE_FEATURE_ROOMS",
  emailTranscript: "VITE_FEATURE_EMAIL_TRANSCRIPT",
};

export const featureEnabled = (featureName: FeatureName): boolean => {
  const envKey = FEATURE_TO_ENV[featureName];
  const envValue = import.meta.env[envKey];
  if (envValue === undefined || envValue === null || envValue === "") {
    return DEFAULT_FEATURES[featureName];
  }
  return envValue === "true";
};
