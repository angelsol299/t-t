import { AudioLines } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useAppSelector } from '@/store';
import { selectPlaybackOf } from '@/store/selectors';
import type { CurrentPlayback } from '@/store/slices/playback';
import { Design } from '@/theme/Design';
import { formatDuration } from '@/utils/format';

/** Clip length; while loaded in the player it doubles as the progress bar. */
export function LengthPill({ messageId, ms }: { messageId: string; ms: number }) {
  const lengthLabel = formatDuration(ms);
  // Only the row loaded in the player gets a value here, so only it re-renders.
  const current = useAppSelector((state) => selectPlaybackOf(state, messageId));
  const progress = usePlaybackProgress(current);

  let accessibilityLabel = `Length ${lengthLabel}`;
  if (current?.playing) accessibilityLabel += ', playing';
  else if (current) accessibilityLabel += `, paused at ${formatDuration(current.positionMs)}`;

  return (
    <View style={[styles.pill, current && styles.pillActive]} accessible accessibilityLabel={accessibilityLabel}>
      {current && <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />}
      <AudioLines size={12} color={Design.color.ink} strokeWidth={2.4} />
      <Text style={styles.text}>{lengthLabel}</Text>
    </View>
  );
}

/**
 * How far through the clip we are, 0 to 1. It starts from the position the
 * player reports and animates on the native thread over exactly the time left,
 * so the pill is full at the moment the audio ends. Paused, it holds still.
 */
function usePlaybackProgress(current: CurrentPlayback | null) {
  const [progress] = useState(() => new Animated.Value(0));
  const playing = current?.playing ?? false;
  const positionMs = current?.positionMs ?? 0;
  const durationMs = current?.durationMs ?? 0;

  useEffect(() => {
    if (durationMs <= 0) return;
    progress.setValue(Math.min(1, positionMs / durationMs));
    if (!playing) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, durationMs - positionMs),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, playing, positionMs, durationMs]);

  return progress;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.xsmall,
    paddingVertical: Design.space.xxsmall,
    paddingHorizontal: Design.space.small,
    borderRadius: Design.radius.pill,
    borderWidth: 1.5,
    borderColor: Design.color.neutral300,
    overflow: 'hidden',
  },
  pillActive: { borderColor: Design.color.live },
  text: { ...Design.typography.pill, color: Design.color.ink },
  // Full width, scaled from the left edge by the playback progress.
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    transformOrigin: 'left',
    backgroundColor: Design.color.live,
  },
});
