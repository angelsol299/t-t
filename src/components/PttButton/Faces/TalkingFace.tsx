import { Design } from '@/theme/Design';
import { StyleSheet, Text, View } from 'react-native';
import { LevelMeter } from '../LevelMeter';
import { TalkTimer } from '../TalkTimer';

interface TalkingFaceProps {
  title: string;
  caption: string;
  captionColor?: string;
  headline: string;
  startedAt: number;
  level: number;
  color: string;
  warnColor: string;
}

/** While I'm talking, live or recording to send later. */
export function TalkingFace({ title, caption, captionColor, headline, startedAt, level, color, warnColor }: TalkingFaceProps) {
  return (
    <>
      <View style={styles.top}>
        <Text style={[styles.caption, { color }]}>{title}</Text>
        <Text style={[styles.caption, { color: captionColor ?? color }]}>{caption}</Text>
      </View>
      <LevelMeter level={level} bars={16} color={color} />
      <View style={styles.bottom}>
        <Text style={[styles.headline, { color }]}>{headline}</Text>
        <TalkTimer startedAt={startedAt} color={color} warnColor={warnColor} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  caption: Design.typography.caps,
  headline: Design.typography.headline,
});
