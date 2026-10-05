import { Design } from '@/theme/Design';
import { Mic } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export function HoldToTalkFace({ caption, color }: { caption: string; color: string }) {
  return (
    <>
      <Text style={[styles.caption, { color }]}>{caption}</Text>
      <View style={styles.bottom}>
        <Text style={[styles.headline, { color }]}>{'Hold\nto talk'}</Text>
        <Mic size={32} color={color} strokeWidth={2} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  caption: Design.typography.caps,
  headline: Design.typography.headline,
});
