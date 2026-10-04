import { StyleSheet, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { Design } from '@/theme/Design';

// Bar shapes from the design; scaled by the live level so the meter moves with the voice.
const BAR_SHAPE = [0.3, 0.6, 0.45, 0.9, 0.7, 0.35, 0.8, 1, 0.55, 0.25, 0.65, 0.85, 0.4, 0.2, 0.5, 0.75];

/** Voice level bars: mine while I talk, the speaker's while I listen. */
export function LevelMeter({ level, bars, color }: { level: number; bars: number; color: string }) {
  const now = useNow(120); // a gentle wobble, so the meter looks alive between level updates
  const clampedLevel = Math.max(0.12, Math.min(1, level));
  const heights = Array.from({ length: bars }, (_, index) => {
    const wobble = 0.75 + 0.25 * Math.sin(now / 90 + index * 1.7);
    return Math.max(0.1, Math.min(1, BAR_SHAPE[index % BAR_SHAPE.length] * clampedLevel * wobble * 1.4));
  });

  return (
    <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heights.map((height, index) => (
        <View key={index} style={[styles.bar, { height: `${height * 100}%`, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall, height: 40 },
  bar: { width: 4, borderRadius: 4 },
});
