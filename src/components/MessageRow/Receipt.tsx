import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { registry } from '@/services/registry';
import type { Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { formatClockTime } from '@/utils/format';
import { Tag } from './Tag';

/** The text after the tags: the time, "Heard by N", or how my unsent clip is doing. */
export function Receipt({ row, next }: { row: Row; next: boolean }) {
  const time = formatClockTime(row.at);
  switch (row.receipt.kind) {
    case 'time':
      return <Text style={styles.meta}>{next ? `Next · ${time}` : time}</Text>;
    case 'heard': {
      const { heardBy } = row.receipt;
      if (heardBy === 0) return <Text style={styles.meta}>{time}</Text>;
      return (
        <View style={styles.heard}>
          <Check size={14} color={Design.color.backText} strokeWidth={2.4} />
          <Text style={styles.meta}>{`Heard by ${heardBy} · ${time}`}</Text>
        </View>
      );
    }
    case 'sending':
      return <Text style={styles.meta}>Sending… · {time}</Text>;
    case 'queued':
      return <Tag text="Not sent yet" tone="alert" />;
    case 'failed':
      return (
        <Pressable
          onPress={() => registry.controller?.retryClip(row.id)}
          accessibilityRole="button"
          accessibilityLabel="Not sent. Tap to retry"
        >
          <Tag text="Not sent · Retry" tone="alert" />
        </Pressable>
      );
  }
}

const styles = StyleSheet.create({
  meta: { ...Design.typography.row, color: Design.color.neutral700, fontVariant: ['tabular-nums'] },
  heard: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall },
});
