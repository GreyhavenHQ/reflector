export const MAX_RETRIES = 10;

export function getReconnectDelayMs(retryIndex: number): number {
  return Math.min(1000 * Math.pow(2, retryIndex), 30000);
}
