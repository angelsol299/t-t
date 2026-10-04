import { Design } from '@/theme/Design';
import { StyleSheet, Text, View } from 'react-native';

export function WeakBand() {
  return (
    <View style={[styles.band, styles.weak]} accessibilityLiveRegion="polite">
      <Text style={styles.weakText}>Weak signal — messages may be slow</Text>
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
});
