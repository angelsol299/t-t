import { StyleSheet, Text, View } from 'react-native';
import { Design } from '@/theme/Design';

/** 01: how others will see you when you talk, updated as you type. */
export function NamePreview({ name }: { name: string }) {
  const shown = name || 'Your name';
  return (
    <View style={styles.preview} accessible accessibilityLabel={`Preview: ${shown} is talking`}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[Design.typography.bodyStrong, { color: Design.color.ink }]} numberOfLines={1}>
          {shown} is talking…
        </Text>
        <Text style={[Design.typography.meta, { color: Design.color.neutral700 }]}>This is how others see you</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: Design.space.medium, paddingHorizontal: Design.space.xsmall },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Design.color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Design.fontFamily.bold, fontSize: Design.fontSize.small, color: Design.color.ground },
  text: { flex: 1, gap: Design.space.xxsmall },
});
