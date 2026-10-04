import { Design } from '@/theme/Design';
import { History } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export function RecordedTimeMessage() {
  return (
    <View style={styles.foot}>
      <History size={16} color={Design.color.neutral700} strokeWidth={2} />
      <Text style={styles.footText}>Talk is recorded and kept for 30 days.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { flexDirection: 'row', alignItems: 'center', gap: Design.space.small },
  footText: { ...Design.typography.meta, color: Design.color.neutral700 },
});
