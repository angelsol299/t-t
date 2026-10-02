import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Design } from '@/theme/Design';
import { Logo } from './Logo';

/** 00: shown over the native splash (same ink) while the channel connects. */
export function Splash() {
  return (
    <SafeAreaView style={styles.root} accessibilityLabel="Teton Talk is connecting">
      <View style={styles.center}>
        <Logo size={112} color={Design.color.ground} />
        <View style={styles.words}>
          <Text style={[Design.typography.splash, { color: Design.color.ground }]}>{'Teton\nTalk'}</Text>
          <Text style={styles.tagline}>Always on for the people who care.</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={[Design.typography.caps, { color: Design.color.neutral400 }]}>By Teton</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Design.color.ink },
  center: { flex: 1, justifyContent: 'center', gap: Design.space.xlarge, paddingHorizontal: Design.space.xlarge },
  words: { gap: Design.space.small },
  tagline: { ...Design.typography.body, color: Design.color.neutral400 },
  footer: {
    borderTopWidth: 2,
    borderTopColor: Design.color.neutral700,
    marginHorizontal: Design.space.xlarge,
    paddingTop: Design.space.regular,
    paddingBottom: Design.space.xlarge,
  },
});
