import { useEffect, useState } from 'react';
import { SERVER_URL } from '@/config';
import { useAppSelector } from '@/store';
import { selectOnline } from '@/store/selectors';

/**
 * How many people are on the channel, for the join button. Once connected the
 * store knows; before the first join there is no socket yet, so ask /health.
 * Null until known (or if the server can't be reached).
 */
export function useOnlineCount(connected: boolean): number | null {
  const live = useAppSelector(selectOnline);
  const [fetched, setFetched] = useState<number | null>(null);

  useEffect(() => {
    if (connected) return;
    fetch(`${SERVER_URL}/health`)
      .then((response) => response.json())
      .then((body: { online?: number }) => setFetched(body.online ?? null))
      .catch(() => {});
  }, [connected]);

  return connected ? live : fetched;
}
