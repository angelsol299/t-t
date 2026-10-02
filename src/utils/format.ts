export function duration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function clock(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "Sent 2 min ago" for clips that arrived more than 30s after they were said. */
export function sentAgo(recordedAt: number, now: number): string {
  const min = Math.max(1, Math.round((now - recordedAt) / 60_000));
  if (min < 60) return `Sent ${min} min ago`;
  return `Sent at ${clock(recordedAt)}`;
}
