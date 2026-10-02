export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Sent 2 min ago" for clips that arrived more than 30s after they were said. */
export function sentAgo(recordedAt: number, now: number): string {
  const min = Math.max(1, Math.round((now - recordedAt) / 60_000));
  if (min < 60) return `Sent ${min} min ago`;
  return `Sent at ${clock(recordedAt)}`;
}
