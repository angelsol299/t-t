import { Design } from '@/theme/Design';
import { StyleSheet, Text, View } from 'react-native';
import { LevelMeter } from '../LevelMeter';
import { TalkTimer } from '../TalkTimer';
/** 04: someone else is talking. */
export function ReceivingFace({
  name,
  startedAt,
  level,
  color,
}: {
  name: string;
  startedAt: number;
  level: number;
  color: string;
}) {
  return (
    <>
      <Text style={[styles.caption, { color }]}>Live</Text>
      <LevelMeter level={level} bars={12} color={color} />
      <View style={styles.bottom}>
        <View style={styles.speakerBlock}>
          <Text style={[styles.speaker, { color }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.talking}>is talking…</Text>
        </View>
        <TalkTimer startedAt={startedAt} color={color} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  caption: Design.typography.caps,
  speakerBlock: { flex: 1 },
  speaker: Design.typography.speaker,
  talking: {
    ...Design.typography.bodyStrong,
    fontFamily: Design.fontFamily.semiBold,
    color: Design.color.talkSecondary,
    marginTop: Design.space.xsmall,
  },
});
