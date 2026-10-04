import { Design } from '@/theme/Design';
import { RotateCcw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

const styles = StyleSheet.create({
  band: {
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    paddingVertical: Design.space.medium,
    paddingHorizontal: Design.space.regular,
    borderRadius: Design.radius.card,
  },

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
});
