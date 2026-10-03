import { Phone, RotateCcw, RotateCw } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { RECEPTION_PHONE } from '@/config';
import { useNow } from '@/hooks/useNow';
import { Design } from '@/theme/Design';
import { formatDuration } from '@/utils/format';

export function WeakBand() {
  return (
    <View style={[styles.band, styles.weak]} accessibilityLiveRegion="polite">
      <Text style={styles.weakText}>Weak signal — messages may be slow</Text>
    </View>
  );
}

export function BackOnlineBand({ missed, onReplay }: { missed: number; onReplay: () => void }) {
  return (
    <View style={[styles.band, styles.backOnline]} accessibilityLiveRegion="polite">
      <Text style={styles.backOnlineText}>{missed > 0 ? `Back online — ${missed} missed` : 'Back online'}</Text>
      {missed > 0 && (
        <Pressable onPress={onReplay} style={styles.ghost} accessibilityRole="button" accessibilityLabel="Replay all">
          <RotateCcw size={14} color={Design.color.backText} strokeWidth={2.2} />
          <Text style={styles.backOnlineText}>Replay all</Text>
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
  const now = useNow(500);
  const retryIn = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;
  const title = `Offline for ${formatDuration(now - since)}${saved > 0 ? ` — ${saved} saved` : ''}`;
  return (
    <View style={[styles.band, styles.offline]} accessibilityLiveRegion="polite">
      <View style={styles.offlineTop}>
        <View style={styles.offlineText}>
          <Text style={styles.offlineTitle}>{title}</Text>
          <Text style={styles.offlineBody}>
            {saved > 0 ? "They send automatically when you're back online." : 'Talk still works — it sends when you’re back.'}
          </Text>
        </View>
        <Pressable
          onPress={onRetry}
          hitSlop={Design.space.medium}
          accessibilityRole="button"
          accessibilityLabel={retryIn !== null ? `Retrying in ${retryIn} seconds. Retry now` : 'Retry now'}
          style={styles.retry}
        >
          <Text style={styles.retryText}>{retryIn !== null && retryIn > 0 ? `${retryIn}s` : 'Now'}</Text>
          <RotateCw size={14} color={Design.color.offline} strokeWidth={2.2} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => Linking.openURL(`tel:${RECEPTION_PHONE}`)}
        style={({ pressed }) => [styles.call, pressed && styles.callPressed]}
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
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    paddingVertical: Design.space.medium,
    paddingHorizontal: Design.space.regular,
    borderRadius: Design.radius.card,
  },
  weak: { backgroundColor: Design.color.weakBg },
  weakText: { ...Design.typography.band, color: Design.color.weakText },
  backOnline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 0,
    minHeight: Design.layout.minimumTouchTarget,
    backgroundColor: Design.color.backBg,
  },
  backOnlineText: { ...Design.typography.band, color: Design.color.backText },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.xsmall,
    minHeight: Design.layout.minimumTouchTarget,
    paddingHorizontal: Design.space.xsmall,
  },
  offline: {
    backgroundColor: Design.color.offlineBg,
    paddingTop: Design.space.medium,
    paddingBottom: Design.space.regular,
    gap: Design.space.medium,
  },
  offlineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Design.space.medium },
  offlineText: { flex: 1, gap: Design.space.xxsmall },
  offlineTitle: { ...Design.typography.rowStrong, color: Design.color.offline },
  offlineBody: { ...Design.typography.row, color: Design.color.offline },
  retry: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall },
  retryText: { ...Design.typography.band, fontVariant: ['tabular-nums'], color: Design.color.offline },
  call: {
    height: 48,
    borderRadius: Design.radius.card,
    backgroundColor: Design.color.offline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Design.space.regular,
  },
  callPressed: { opacity: 0.85 },
  callText: { fontFamily: Design.fontFamily.medium, fontSize: Design.fontSize.small, color: Design.color.white },
});
