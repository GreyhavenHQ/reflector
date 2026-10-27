import { useEffect, useState } from "react";

/**
 * Current time, refreshed every `intervalMs`.
 *
 * Lets countdowns and "live vs upcoming" states move on their own instead of
 * freezing at the value computed on first render.
 */
export function useNow(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
