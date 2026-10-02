import { StyleSheet, Text, View } from 'react-native';
import { Design } from '@/theme/Design';

export function ChannelHeader({ name, sub }: { name: string; sub: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[Design.typography.channel, { color: Design.color.ink }]} accessibilityRole="header">
        {name}
      </Text>
      <Text style={[Design.typography.meta, styles.sub]} accessibilityLiveRegion="polite">
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Design.space.medium, paddingHorizontal: Design.space.large, paddingBottom: Design.space.xlarge },
  sub: { color: Design.color.neutral700, marginTop: Design.space.small },
});
