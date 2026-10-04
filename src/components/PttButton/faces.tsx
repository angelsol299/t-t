import { Mic, MicOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import type { PushToTalkState } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { LevelMeter } from './LevelMeter';
import { TalkTimer } from './TalkTimer';

// What is written on the button in each state (screens 02–08). `color` is the
// look's foreground (look.ts), so a face never decides its own colours.

export function Face({ state, color }: { state: PushToTalkState; color: string }) {
  switch (state.kind) {
    case 'idle':
    case 'pending':
      return (
        <HoldToTalkFace
          caption={state.kind === 'idle' && state.offline ? 'Sends when back online' : 'Push to talk'}
          color={color}
        />
      );
    // 03: I hold the floor and everyone hears me.
    case 'live':
      return (
        <TalkingFace
          title="On air"
          caption={`${state.listeners} hear you`}
          headline={'You’re\nlive'}
          startedAt={state.startedAt}
          level={state.level}
          color={color}
          warnColor={Design.color.weakText}
        />
      );
    // Weak or no signal: recording on the phone, sent when complete or back online. Deliberately not green.
    case 'local':
      return (
        <TalkingFace
          title="Recording"
          caption={state.offline ? 'Sends when back online' : 'Sends when complete'}
          captionColor={Design.color.neutral700}
          headline={'Saving\nmessage'}
          startedAt={state.startedAt}
          level={state.level}
          color={color}
          warnColor={Design.color.offline}
        />
      );
    case 'receiving':
      return <ReceivingFace name={state.name} startedAt={state.startedAt} level={state.level} color={color} />;
    case 'micOff':
      return <MicOffFace color={color} />;
  }
}

function HoldToTalkFace({ caption, color }: { caption: string; color: string }) {
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
function TalkingFace({ title, caption, captionColor, headline, startedAt, level, color, warnColor }: TalkingFaceProps) {
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

/** 04: someone else is talking. */
function ReceivingFace({ name, startedAt, level, color }: { name: string; startedAt: number; level: number; color: string }) {
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

function MicOffFace({ color }: { color: string }) {
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
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  speakerBlock: { flex: 1 },
  // Text colours come from the look, so they are set where used.
  caption: Design.typography.caps,
  headline: Design.typography.headline,
  speaker: Design.typography.speaker,
  micOffCaption: { ...Design.typography.caps, color: Design.color.neutral700 },
  talking: {
    ...Design.typography.bodyStrong,
    fontFamily: Design.fontFamily.semiBold,
    color: Design.color.talkSecondary,
    marginTop: Design.space.xsmall,
  },
});
