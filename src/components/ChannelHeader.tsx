import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '@/theme/tokens';

export function ChannelHeader({ name, sub }: { name: string; sub: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[type.channel, { color: colors.ink }]} accessibilityRole="header">
        {name}
      </Text>
      <Text style={[type.meta, styles.sub]} accessibilityLiveRegion="polite">
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24 },
  sub: { color: colors.neutral700, marginTop: 8 },
});
