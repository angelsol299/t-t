import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Net } from '@shared/netMachine';
import { Design } from '@/theme/Design';
import { Logo } from './Logo';

interface Status {
  label: string;
  dot: string;
  halo: string;
  haloWidth: number;
  text: string;
}

const ONLINE: Status = {
  label: 'Online',
  dot: Design.color.live,
  halo: Design.color.liveHalo,
  haloWidth: 4,
  text: Design.color.ink,
};

const STATUS: Record<Net, Status> = {
  online: ONLINE,
  recovering: ONLINE, // the green "Back online" band says the rest
  weak: { label: 'Weak', dot: Design.color.weakDot, halo: Design.color.weakBg, haloWidth: 3, text: Design.color.weakText },
  offline: {
    label: 'Offline',
    dot: Design.color.offline,
    halo: Design.color.offlineBg,
    haloWidth: 4,
    text: Design.color.neutral700,
  },
};

const DOT = 8;
const PULSE_MS = 1800;

/** 8px status dot with its halo and a ring rippling out from it. */
function StatusDot({ dot, halo, haloWidth }: Status) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (reduce || cancelled) return;
        loop = Animated.loop(
          Animated.timing(progress, { toValue: 1, duration: PULSE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
      progress.setValue(0);
    };
  }, [progress]);

  const haloSize = DOT + haloWidth * 2;
  return (
    <View style={styles.dotBox}>
      <View style={[styles.circle, { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: halo }]} />
      <Animated.View
        style={[
          styles.circle,
          styles.dot,
          {
            backgroundColor: dot,
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
          },
        ]}
      />
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
  const status = net ? STATUS[net] : null;
  return (
    <View style={styles.bar}>
      <Pressable
        onLongPress={onLongPressBrand}
        disabled={!onLongPressBrand}
        accessibilityHint={onLongPressBrand ? 'Long press to change your name' : undefined}
        style={styles.brand}
      >
        <Logo size={22} />
        <Text style={styles.brandText}>Teton Talk</Text>
      </Pressable>
      {status ? (
        <View style={styles.status} accessibilityLabel={`Network ${status.label}`} accessibilityRole="text">
          <StatusDot {...status} />
          <Text style={[styles.label, { color: status.text }]}>{status.label}</Text>
        </View>
      ) : right ? (
        <Text style={styles.label}>{right}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Design.space.regular,
    paddingHorizontal: Design.space.large,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Design.space.small },
  brandText: { ...Design.typography.brand, color: Design.color.ink },
  label: { ...Design.typography.caps, color: Design.color.ink },
  status: { flexDirection: 'row', alignItems: 'center', gap: Design.space.small },
  // Laid out as the 8px dot; the halo and pulse ring overflow it, like the
  // handoff's box-shadow halo.
  dotBox: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  circle: { position: 'absolute' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
