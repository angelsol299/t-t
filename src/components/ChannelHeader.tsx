import { StyleSheet, Text, View } from 'react-native';
import { Design } from '@/theme/Design';

export function ChannelHeader({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[Design.typography.channel, { color: Design.color.ink }]} accessibilityRole="header">
        {name}
      </Text>
      <Text style={[Design.typography.meta, styles.subtitle]} accessibilityLiveRegion="polite">
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Design.space.medium, paddingHorizontal: Design.space.large, paddingBottom: Design.space.xlarge },
  subtitle: { color: Design.color.neutral700, marginTop: Design.space.small },
});
