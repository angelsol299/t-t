import { useEffect, useState } from 'react';

/** Re-renders every `ms` while `active`, for timers and countdowns. */
export function useNow(active = true, ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
}
