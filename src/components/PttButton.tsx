import { Mic, MicOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNow } from '@/hooks/useNow';
import type { PushToTalkState } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { formatDuration } from '@/utils/format';
import { MAX_CLIP_MS } from '@shared/protocol';

// The big push-to-talk button. Each state has a look (colours and frame) and
// a face (what's written on the button), defined separately below.

interface Props {
  state: PushToTalkState;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function PttButton({ state, onPressIn, onPressOut }: Props) {
  const look = lookFor(state);
  const micOff = state.kind === 'micOff';
  return (
    <Pressable
      onPressIn={micOff ? undefined : onPressIn}
      onPressOut={micOff ? undefined : onPressOut}
      onPress={micOff ? () => Linking.openSettings() : undefined}
      // A finger that drifts while talking must not end the transmission.
      pressRetentionOffset={{ top: 400, bottom: 200, left: 200, right: 200 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(state)}
      accessibilityHint={micOff ? undefined : 'Hold to talk, release to stop'}
      style={[styles.button, { backgroundColor: look.background }, look.frame]}
    >
      <Face state={state} color={look.foreground} />
    </Pressable>
  );
}

// ── look ─────────────────────────────────────────────────────────────────────

interface Look {
  background: string;
  foreground: string;
  frame?: StyleProp<ViewStyle>;
}

function lookFor(state: PushToTalkState): Look {
  const solid: Look = { background: Design.color.ink, foreground: Design.color.ground };
  // Outlined means "not reaching anyone right now": offline, recording to send later, mic off.
  const outlined: Look = { background: Design.color.surface, foreground: Design.color.ink, frame: styles.outlined };
  switch (state.kind) {
    case 'idle':
      return state.offline ? outlined : solid;
    case 'pending':
      return { ...solid, frame: styles.pending };
    case 'live':
      return { background: Design.color.live, foreground: Design.color.liveText, frame: styles.ring };
    case 'local':
    case 'micOff':
      return outlined;
    case 'receiving':
      return { background: Design.color.talkBg, foreground: Design.color.talkText };
  }
}

function accessibilityLabelFor(state: PushToTalkState): string {
  switch (state.kind) {
    case 'live':
      return "You're live";
    case 'local':
      return 'Recording';
    case 'receiving':
      return `${state.name} is talking`;
    case 'micOff':
      return 'Microphone off. Open settings to allow it';
    default:
      return 'Push to talk';
  }
}

// ── faces ────────────────────────────────────────────────────────────────────

function Face({ state, color }: { state: PushToTalkState; color: string }) {
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
      <Text style={[Design.typography.caps, { color }]}>{caption}</Text>
      <View style={styles.bottom}>
        <Text style={[Design.typography.headline, { color }]}>{'Hold\nto talk'}</Text>
        <Mic size={32} color={color} strokeWidth={2} />
      </View>
    </>
  );
}

/** While I'm talking, live or recording to send later. */
function TalkingFace({
  title,
  caption,
  captionColor,
  headline,
  startedAt,
  level,
  color,
  warnColor,
}: {
  title: string;
  caption: string;
  captionColor?: string;
  headline: string;
  startedAt: number;
  level: number;
  color: string;
  warnColor: string;
}) {
  return (
    <>
      <View style={styles.top}>
        <Text style={[Design.typography.caps, { color }]}>{title}</Text>
        <Text style={[Design.typography.caps, { color: captionColor ?? color }]}>{caption}</Text>
      </View>
      <LevelMeter level={level} bars={16} color={color} />
      <View style={styles.bottom}>
        <Text style={[Design.typography.headline, { color }]}>{headline}</Text>
        <Timer startedAt={startedAt} color={color} warnColor={warnColor} />
      </View>
    </>
  );
}

/** 04: someone else is talking. */
function ReceivingFace({ name, startedAt, level, color }: { name: string; startedAt: number; level: number; color: string }) {
  return (
    <>
      <Text style={[Design.typography.caps, { color }]}>Live</Text>
      <LevelMeter level={level} bars={12} color={color} />
      <View style={styles.bottom}>
        <View style={styles.flex}>
          <Text style={[Design.typography.speaker, { color }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[Design.typography.bodyStrong, styles.talking]}>is talking…</Text>
        </View>
        <Timer startedAt={startedAt} color={color} />
      </View>
    </>
  );
}

function MicOffFace({ color }: { color: string }) {
  return (
    <>
      <Text style={[Design.typography.caps, { color: Design.color.neutral700 }]}>Microphone off</Text>
      <View style={styles.bottom}>
        <Text style={[Design.typography.headline, { color }]}>{'Allow\nmicrophone'}</Text>
        <MicOff size={32} color={color} strokeWidth={2} />
      </View>
    </>
  );
}

// ── parts ────────────────────────────────────────────────────────────────────

// Bar shapes from the design; scaled by the live level so the meter moves with the voice.
const BAR_SHAPE = [0.3, 0.6, 0.45, 0.9, 0.7, 0.35, 0.8, 1, 0.55, 0.25, 0.65, 0.85, 0.4, 0.2, 0.5, 0.75];

function LevelMeter({ level, bars, color }: { level: number; bars: number; color: string }) {
  const now = useNow(true, 120);
  const heights = useMemo(() => {
    const clampedLevel = Math.max(0.12, Math.min(1, level));
    return Array.from({ length: bars }, (_, index) => {
      const wobble = 0.75 + 0.25 * Math.sin(now / 90 + index * 1.7);
      return Math.max(0.1, Math.min(1, BAR_SHAPE[index % BAR_SHAPE.length] * clampedLevel * wobble * 1.4));
    });
  }, [level, bars, now]);
  return (
    <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heights.map((height, index) => (
        <View key={index} style={[styles.meterBar, { height: `${height * 100}%`, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const WARN_BEFORE_MAX_MS = 10_000; // the timer changes colour for the last 10 seconds

function Timer({ startedAt, color, warnColor }: { startedAt: number; color: string; warnColor?: string }) {
  const now = useNow(true, 250);
  const elapsed = now - startedAt;
  const warn = warnColor && MAX_CLIP_MS - elapsed <= WARN_BEFORE_MAX_MS;
  return (
    <Text style={[Design.typography.headline, styles.tabular, { color: warn ? warnColor : color }]}>
      {formatDuration(elapsed)}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 260,
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    borderRadius: Design.radius.phone,
    padding: Design.space.xlarge,
    justifyContent: 'space-between',
  },
  outlined: { borderWidth: 2, borderColor: Design.color.neutral300 },
  pending: { opacity: 0.88 },
  ring: { outlineWidth: 6, outlineStyle: 'solid', outlineColor: Design.color.liveRing },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall, height: 40 },
  meterBar: { width: 4, borderRadius: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  talking: { color: Design.color.talkSecondary, fontFamily: Design.fontFamily.semiBold, marginTop: Design.space.xsmall },
});
