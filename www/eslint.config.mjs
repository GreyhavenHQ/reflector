import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [".next/", "coverage/", "public/", "app/reflector-api.d.ts"],
  },
  {
    // Auth modules handle access/refresh tokens. console.log/debug/info is how
    // those tokens ended up in the server logs, so the whole class of statement
    // is banned here. console.error/warn stay allowed for genuine failure
    // paths, but must never be handed a token or a raw token payload.
    files: [
      "app/lib/authBackend.ts",
      "app/lib/redisTokenCache.ts",
      "app/lib/redisClient.ts",
      "app/lib/types.ts",
      "app/lib/AuthProvider.tsx",
      "app/lib/SessionAutoRefresh.tsx",
      "app/login/page.tsx",
      "app/api/auth/**/*.ts",
      "proxy.ts",
    ],
    languageOptions: { parser: tsParser },
    rules: {
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
];
