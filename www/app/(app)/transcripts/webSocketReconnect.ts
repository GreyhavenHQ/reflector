/** Reconnection policy for WebSocket: exponential backoff, capped at 30s. */
export const MAX_RETRIES = 10;

/**
 * Delay in ms before reconnecting. retryIndex is 0-based (0 = first retry).
 * Returns 1000, 2000, 4000, ... up to 30000 max.
 */
export function getReconnectDelayMs(retryIndex: number): number {
  return Math.min(1000 * Math.pow(2, retryIndex), 30000);
}
