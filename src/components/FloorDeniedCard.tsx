import { Clock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, type } from '@/theme/tokens';

/** 08: shown only to the person who lost a simultaneous-press race. */
export function FloorDeniedCard({ name }: { name: string }) {
  return (
    <View style={styles.card} accessibilityLiveRegion="assertive">
      <Clock size={20} color={colors.ink} strokeWidth={2} />
      <View style={styles.text}>
        <Text style={[type.rowStrong, { color: colors.ink }]}>{name} got there first</Text>
        <Text style={[type.row, { color: colors.neutral700 }]}>Keep holding and you go live the moment they stop.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.neutral300,
  },
  text: { flex: 1, gap: 2 },
});
