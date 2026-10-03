import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store';
import { selectEverConnected, selectHasName } from '@/store/selectors';

// The splash always shows for at least SPLASH_MIN_MS so the brand moment is
// actually seen (fonts alone load in a few ms). It is held while the channel
// connects, but never longer than SPLASH_MAX_MS: with no signal the app opens
// in its offline state (recording still works).
const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 2000;

/** Whether the JS splash should still cover the app. */
export function useSplashVisible(fontsLoaded: boolean): boolean {
  const hasName = useAppSelector(selectHasName);
  const connected = useAppSelector(selectEverConnected);
  const minElapsed = useHasElapsed(SPLASH_MIN_MS);
  const maxElapsed = useHasElapsed(SPLASH_MAX_MS);

  if (!fontsLoaded || !minElapsed) return true;
  // First launch goes straight to the name screen; nothing to connect yet.
  const waitingForChannel = hasName && !connected;
  return waitingForChannel && !maxElapsed;
}

/** False until `ms` after the first render, then true. */
function useHasElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return elapsed;
}
