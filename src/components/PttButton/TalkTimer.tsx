import { StyleSheet, Text } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { Design } from '@/theme/Design';
import { formatDuration } from '@/utils/format';
import { MAX_CLIP_MS } from '@shared/protocol';

const WARN_BEFORE_MAX_MS = 10_000; // the timer changes colour for the last 10 seconds

interface Props {
  startedAt: number;
  color: string;
  /** Colour for the last seconds before the 60-second cap. Leave out to never warn. */
  warnColor?: string;
}

/** How long the current talk has lasted, ticking on its own. */
export function TalkTimer({ startedAt, color, warnColor }: Props) {
  const now = useNow(250);
  const elapsed = now - startedAt;
  const warn = warnColor && MAX_CLIP_MS - elapsed <= WARN_BEFORE_MAX_MS;
  return <Text style={[styles.timer, { color: warn ? warnColor : color }]}>{formatDuration(elapsed)}</Text>;
}

const styles = StyleSheet.create({
  timer: { ...Design.typography.headline, fontVariant: ['tabular-nums'] },
});
