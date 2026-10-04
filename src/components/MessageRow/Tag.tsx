import { StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { Design } from '@/theme/Design';
import { formatSentAgo } from '@/utils/format';

interface Props {
  text: string;
  tone: 'alert' | 'neutral';
  caps?: boolean;
}

/** A small pill: red for problems (MISSED, Not sent), grey for information. */
export function Tag({ text, tone, caps }: Props) {
  const alert = tone === 'alert';
  return (
    <View style={[styles.tag, alert ? styles.alert : styles.neutral]}>
      <Text style={[caps ? styles.capsText : styles.text, alert ? styles.alertText : styles.neutralText]}>{text}</Text>
    </View>
  );
}

/** "Sent 2 min ago": ticks on its own so the rest of the list doesn't re-render. */
export function SentAgoTag({ at }: { at: number }) {
  const now = useNow(30_000);
  return <Tag text={formatSentAgo(at, now)} tone="neutral" />;
}

const styles = StyleSheet.create({
  tag: { paddingVertical: Design.space.xsmall, paddingHorizontal: Design.space.small, borderRadius: Design.radius.pill },
  alert: { backgroundColor: Design.color.offlineBg },
  neutral: { backgroundColor: Design.color.neutral200 },
  text: Design.typography.pill,
  capsText: {
    fontFamily: Design.fontFamily.semiBold,
    fontSize: Design.fontSize.xxxxsmall,
    letterSpacing: Design.letterSpacing(0.08, Design.fontSize.xxxxsmall),
  },
  alertText: { color: Design.color.offline },
  neutralText: { color: Design.color.neutral700 },
});
