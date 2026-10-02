import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Net } from '@shared/netMachine';
import { colors, type } from '@/theme/tokens';
import { Logo } from './Logo';

const STATUS: Record<Net, { label: string; dot: string; halo: string; text: string }> = {
  online: { label: 'Online', dot: colors.live, halo: colors.liveHalo, text: colors.ink },
  recovering: { label: 'Online', dot: colors.live, halo: colors.liveHalo, text: colors.ink },
  weak: { label: 'Weak', dot: colors.weakDot, halo: colors.weakBg, text: colors.weakText },
  offline: { label: 'Offline', dot: colors.offline, halo: colors.offlineBg, text: colors.n700 },
};

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
          <View style={[styles.dot, { backgroundColor: st.dot, borderColor: st.halo }]} />
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
  // 8px dot with a 4px halo: drawn as a 16px circle with a 4px border.
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 4, marginRight: -4, marginLeft: -4 },
});
