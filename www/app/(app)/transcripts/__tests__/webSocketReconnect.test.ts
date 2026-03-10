/**
 * Reconnection policy for WebSocket.
 * Ensures exponential backoff is applied and capped at 30s.
 */
import { getReconnectDelayMs, MAX_RETRIES } from "../webSocketReconnect";

describe("webSocketReconnect", () => {
  describe("getReconnectDelayMs", () => {
    it("returns exponential backoff: 1s, 2s, 4s, 8s, 16s, then cap 30s", () => {
      expect(getReconnectDelayMs(0)).toBe(1000);
      expect(getReconnectDelayMs(1)).toBe(2000);
      expect(getReconnectDelayMs(2)).toBe(4000);
      expect(getReconnectDelayMs(3)).toBe(8000);
      expect(getReconnectDelayMs(4)).toBe(16000);
      expect(getReconnectDelayMs(5)).toBe(30000); // 32s capped to 30s
      expect(getReconnectDelayMs(6)).toBe(30000);
      expect(getReconnectDelayMs(9)).toBe(30000);
    });

    it("never exceeds 30s for any retry index", () => {
      for (let i = 0; i <= MAX_RETRIES; i++) {
        expect(getReconnectDelayMs(i)).toBeLessThanOrEqual(30000);
      }
    });
  });
});
