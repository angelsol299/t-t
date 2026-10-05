import { Design } from '@/theme/Design';
import { MicOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export function MicOffFace({ color }: { color: string }) {
  return (
    <>
      <Text style={styles.micOffCaption}>Microphone off</Text>
      <View style={styles.bottom}>
        <Text style={[styles.headline, { color }]}>{'Allow\nmicrophone'}</Text>
        <MicOff size={32} color={color} strokeWidth={2} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headline: Design.typography.headline,
  micOffCaption: { ...Design.typography.caps, color: Design.color.neutral700 },
});
