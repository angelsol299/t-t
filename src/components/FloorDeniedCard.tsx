import { Clock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Design } from '@/theme/Design';

/** 08: shown only to the person who lost a simultaneous-press race. */
export function FloorDeniedCard({ name }: { name: string }) {
  return (
    <View style={styles.card} accessibilityLiveRegion="assertive">
      <Clock size={20} color={Design.color.ink} strokeWidth={2} />
      <View style={styles.text}>
        <Text style={[Design.typography.rowStrong, { color: Design.color.ink }]}>{name} got there first</Text>
        <Text style={[Design.typography.row, { color: Design.color.neutral700 }]}>Keep holding and you go live the moment they stop.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.medium,
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    paddingVertical: Design.space.medium,
    paddingHorizontal: Design.space.regular,
    borderRadius: Design.radius.card,
    backgroundColor: Design.color.white,
    borderWidth: 1.5,
    borderColor: Design.color.neutral300,
  },
  text: { flex: 1, gap: Design.space.xxsmall },
});
