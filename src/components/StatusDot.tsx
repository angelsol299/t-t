import { usePulse } from '@/hooks/usePulse';
import { Animated, StyleSheet, View } from 'react-native';

const DOT = 8;

interface Props {
  color: string;
  halo: string;
  haloWidth: number;
}

/** 8px status dot with its halo and a ring rippling out from it. */
export function StatusDot({ color, halo, haloWidth }: Props) {
  const pulse = usePulse();
  const haloSize = DOT + haloWidth * 2;

  return (
    <View style={styles.box}>
      <View style={[styles.circle, { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: halo }]} />
      <Animated.View
        style={[
          styles.circle,
          styles.dot,
          {
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
          },
        ]}
      />
      <View style={[styles.circle, styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

/** 0 → 1 on a loop, on the native thread. Stays at 0 when the user has asked for reduced motion. */

const styles = StyleSheet.create({
  // Laid out as the 8px dot; the halo and pulse ring overflow it, like the
  // handoff's box-shadow halo.
  box: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  circle: { position: 'absolute' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
