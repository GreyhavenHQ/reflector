// env vars must be set before any module imports
process.env.AUTHENTIK_REFRESH_TOKEN_URL =
  "https://authentik.example.com/application/o/token/";
process.env.AUTHENTIK_ISSUER =
  "https://authentik.example.com/application/o/reflector/";
process.env.AUTHENTIK_CLIENT_ID = "test-client-id";
process.env.AUTHENTIK_CLIENT_SECRET = "test-client-secret";
process.env.SERVER_API_URL = "http://localhost:1250";
process.env.FEATURE_REQUIRE_LOGIN = "true";
// must NOT be "credentials" so authOptions() returns the Authentik path
delete process.env.AUTH_PROVIDER;

jest.mock("../next", () => ({ isBuildPhase: false }));

jest.mock("../features", () => ({
  featureEnabled: (name: string) => name === "requireLogin",
}));

jest.mock("../redisClient", () => ({
  tokenCacheRedis: {},
  redlock: {
    using: jest.fn((_keys: string[], _ttl: number, fn: () => unknown) => fn()),
  },
}));

jest.mock("../redisTokenCache", () => ({
  getTokenCache: jest.fn().mockResolvedValue(null),
  setTokenCache: jest.fn().mockResolvedValue(undefined),
  deleteTokenCache: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { authOptions } from "../authBackend";

describe("Authentik token refresh", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("refresh request preserves trailing slash in token URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        expires_in: 300,
        refresh_token: "new-refresh-token",
      }),
    });

    const options = authOptions();
    const jwtCallback = options.callbacks!.jwt!;

    // Simulate a returning user whose access token has expired (no account/user = not initial login)
    const expiredToken = {
      sub: "test-user-123",
      accessToken: "expired-access-token",
      accessTokenExpires: Date.now() - 60_000,
      refreshToken: "old-refresh-token",
    };

    await jwtCallback({
      token: expiredToken,
      user: undefined as any,
      account: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: undefined,
    });

    // The refresh POST must go to the exact URL from the env var (trailing slash included)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://authentik.example.com/application/o/token/",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh-token");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });
});
