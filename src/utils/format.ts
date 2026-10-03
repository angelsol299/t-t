/** 75000 → "1:15" */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** A timestamp → "14:05" */
export function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "Sent 2 min ago" for clips that arrived more than 30s after they were said. */
export function formatSentAgo(recordedAt: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - recordedAt) / 60_000));
  if (minutes < 60) return `Sent ${minutes} min ago`;
  return `Sent at ${formatClockTime(recordedAt)}`;
}
