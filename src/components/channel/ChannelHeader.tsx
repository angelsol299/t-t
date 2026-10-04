import { Design } from '@/theme/Design';
import { StyleSheet, Text, View } from 'react-native';

export function ChannelHeader({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {name}
      </Text>
      <Text style={styles.subtitle} accessibilityLiveRegion="polite">
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Design.space.medium, paddingHorizontal: Design.space.large, paddingBottom: Design.space.xlarge },
  title: { ...Design.typography.channel, color: Design.color.ink },
  subtitle: { ...Design.typography.meta, color: Design.color.neutral700, marginTop: Design.space.small },
});
