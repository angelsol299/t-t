import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Net } from '@shared/netMachine';
import { colors, type } from '@/theme/tokens';
import { Logo } from './Logo';

interface Status {
  label: string;
  dot: string;
  halo: string;
  haloWidth: number;
  text: string;
  pulse: boolean;
}

const STATUS: Record<Net, Status> = {
  online: { label: 'Online', dot: colors.live, halo: colors.liveHalo, haloWidth: 4, text: colors.ink, pulse: true },
  recovering: { label: 'Online', dot: colors.live, halo: colors.liveHalo, haloWidth: 4, text: colors.ink, pulse: true },
  weak: { label: 'Weak', dot: colors.weakDot, halo: colors.weakBg, haloWidth: 3, text: colors.weakText, pulse: false },
  offline: { label: 'Offline', dot: colors.offline, halo: colors.offlineBg, haloWidth: 4, text: colors.n700, pulse: false },
};

const DOT = 8;
const PULSE_MS = 1800;

/** 8px status dot with its halo; when live, a ring ripples out from it. */
function StatusDot({ dot, halo, haloWidth, pulse }: Status) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!pulse) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (reduce || cancelled) return;
        loop = Animated.loop(
          Animated.timing(t, { toValue: 1, duration: PULSE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
      t.setValue(0);
    };
  }, [pulse, t]);

  const haloSize = DOT + haloWidth * 2;
  return (
    <View style={styles.dotBox}>
      <View style={[styles.circle, { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: halo }]} />
      {pulse && (
        <Animated.View
          style={[
            styles.circle,
            styles.dot,
            {
              backgroundColor: dot,
              opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
            },
          ]}
        />
      )}
      <View style={[styles.circle, styles.dot, { backgroundColor: dot }]} />
    </View>
  );
}

interface Props {
  net?: Net;
  right?: string;
  onLongPressBrand?: () => void;
}

export function TopBar({ net, right, onLongPressBrand }: Props) {
  const st = net ? STATUS[net] : null;
  return (
    <View style={styles.bar}>
      <Pressable
        onLongPress={onLongPressBrand}
        disabled={!onLongPressBrand}
        accessibilityHint={onLongPressBrand ? 'Long press to change your name' : undefined}
        style={styles.brand}
      >
        <Logo size={22} />
        <Text style={[type.brand, { color: colors.ink }]}>Teton Talk</Text>
      </Pressable>
      {st ? (
        <View style={styles.status} accessibilityLabel={`Network ${st.label}`} accessibilityRole="text">
          <StatusDot {...st} />
          <Text style={[type.caps, { color: st.text }]}>{st.label}</Text>
        </View>
      ) : right ? (
        <Text style={[type.caps, { color: colors.ink }]}>{right}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Laid out as the 8px dot; the halo and pulse ring overflow it, like the
  // handoff's box-shadow halo.
  dotBox: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  circle: { position: 'absolute' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
