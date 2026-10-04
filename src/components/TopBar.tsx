import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Net } from '@shared/netMachine';
import { Design } from '@/theme/Design';
import { Logo } from './Logo';
import { StatusDot } from './StatusDot';

/** How each network state shows in the top bar. */
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
          <StatusDot color={status.dot} halo={status.halo} haloWidth={status.haloWidth} />
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
});
