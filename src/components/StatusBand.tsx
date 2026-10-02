import { Phone, RotateCcw, RotateCw } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { RECEPTION_PHONE } from '@/config';
import { useNow } from '@/hooks/useNow';
import { Design } from '@/theme/Design';
import { duration } from '@/utils/format';

export function WeakBand() {
  return (
    <View style={[styles.band, { backgroundColor: Design.color.weakBg }]} accessibilityLiveRegion="polite">
      <Text style={[Design.typography.band, { color: Design.color.weakText }]}>Weak signal — messages may be slow</Text>
    </View>
  );
}

export function BackOnlineBand({ missed, onReplay }: { missed: number; onReplay: () => void }) {
  return (
    <View style={[styles.band, styles.row, { backgroundColor: Design.color.backBg }]} accessibilityLiveRegion="polite">
      <Text style={[Design.typography.band, { color: Design.color.backText }]}>
        {missed > 0 ? `Back online — ${missed} missed` : 'Back online'}
      </Text>
      {missed > 0 && (
        <Pressable onPress={onReplay} style={styles.ghost} accessibilityRole="button" accessibilityLabel="Replay all">
          <RotateCcw size={14} color={Design.color.backText} strokeWidth={2.2} />
          <Text style={[Design.typography.band, { color: Design.color.backText }]}>Replay all</Text>
        </Pressable>
      )}
    </View>
  );
}

interface OfflineProps {
  since: number;
  saved: number;
  nextRetryAt: number | null;
  onRetry: () => void;
}

export function OfflineBand({ since, saved, nextRetryAt, onRetry }: OfflineProps) {
  const now = useNow(true, 500);
  const retryIn = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;
  const title = `Offline for ${duration(now - since)}${saved > 0 ? ` — ${saved} saved` : ''}`;
  return (
    <View style={[styles.band, styles.offline]} accessibilityLiveRegion="polite">
      <View style={styles.offlineTop}>
        <View style={styles.offlineText}>
          <Text style={[Design.typography.rowStrong, { color: Design.color.offline }]}>{title}</Text>
          <Text style={[Design.typography.row, { color: Design.color.offline }]}>
            {saved > 0 ? "They send automatically when you're back online." : 'Talk still works — it sends when you’re back.'}
          </Text>
        </View>
        <Pressable
          onPress={onRetry}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={retryIn !== null ? `Retrying in ${retryIn} seconds. Retry now` : 'Retry now'}
          style={styles.retry}
        >
          <Text style={[Design.typography.band, styles.tabular, { color: Design.color.offline }]}>
            {retryIn !== null && retryIn > 0 ? `${retryIn}s` : 'Now'}
          </Text>
          <RotateCw size={14} color={Design.color.offline} strokeWidth={2.2} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => Linking.openURL(`tel:${RECEPTION_PHONE}`)}
        style={({ pressed }) => [styles.call, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Urgent? Call reception"
      >
        <Text style={styles.callText}>Urgent? Call reception</Text>
        <Phone size={20} color={Design.color.white} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Design.radius.card,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 0, minHeight: 44 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: Design.layout.minimumTouchTarget, paddingHorizontal: 4 },
  offline: { backgroundColor: Design.color.offlineBg, paddingTop: 14, paddingBottom: 16, gap: 12 },
  offlineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  offlineText: { flex: 1, gap: 2 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabular: { fontVariant: ['tabular-nums'] },
  call: {
    height: 48,
    borderRadius: Design.radius.card,
    backgroundColor: Design.color.offline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  callText: { fontFamily: Design.fontFamily.medium, fontSize: 15, color: Design.color.white },
});
