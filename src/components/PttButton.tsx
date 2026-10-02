import { Mic, MicOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { MAX_CLIP_MS } from '@shared/protocol';
import { Design } from '@/theme/Design';
import { duration } from '@/utils/format';

export type PttState =
  | { kind: 'idle'; offline: boolean }
  | { kind: 'pending' }
  | { kind: 'live'; startedAt: number; listeners: number; level: number }
  | { kind: 'local'; startedAt: number; level: number; offline: boolean }
  | { kind: 'receiving'; name: string; startedAt: number; level: number }
  | { kind: 'micOff' };

interface Props {
  state: PttState;
  onPressIn: () => void;
  onPressOut: () => void;
}

// Bar shapes from the design; scaled by the live level so the meter moves with the voice.
const SHAPE = [0.3, 0.6, 0.45, 0.9, 0.7, 0.35, 0.8, 1, 0.55, 0.25, 0.65, 0.85, 0.4, 0.2, 0.5, 0.75];

function LevelMeter({ level, bars, color }: { level: number; bars: number; color: string }) {
  const now = useNow(true, 120);
  const heights = useMemo(() => {
    const clampedLevel = Math.max(0.12, Math.min(1, level));
    return Array.from({ length: bars }, (_, index) => {
      const wobble = 0.75 + 0.25 * Math.sin(now / 90 + index * 1.7);
      return Math.max(0.1, Math.min(1, SHAPE[index % SHAPE.length] * clampedLevel * wobble * 1.4));
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

function Timer({ startedAt, color, warnColor }: { startedAt: number; color: string; warnColor?: string }) {
  const now = useNow(true, 250);
  const elapsed = now - startedAt;
  const warn = warnColor && MAX_CLIP_MS - elapsed <= 10_000;
  return <Text style={[Design.typography.headline, styles.tabular, { color: warn ? warnColor : color }]}>{duration(elapsed)}</Text>;
}

export function PttButton({ state, onPressIn, onPressOut }: Props) {
  let background: string = Design.color.ink;
  let foreground: string = Design.color.ground;
  let extra: object | null = null;
  let content: React.ReactNode;
  let accessibilityText = 'Push to talk';

  switch (state.kind) {
    case 'idle':
    case 'pending':
      if (state.kind === 'idle' && state.offline) {
        background = Design.color.surface;
        foreground = Design.color.ink;
        extra = styles.outlined;
      }
      content = (
        <>
          <Text style={[Design.typography.caps, { color: foreground }]}>
            {state.kind === 'idle' && state.offline ? 'Sends when back online' : 'Push to talk'}
          </Text>
          <View style={styles.bottom}>
            <Text style={[Design.typography.headline, { color: foreground }]}>{'Hold\nto talk'}</Text>
            <Mic size={32} color={foreground} strokeWidth={2} />
          </View>
        </>
      );
      if (state.kind === 'pending') extra = { opacity: 0.88 };
      break;
    case 'live':
      background = Design.color.live;
      foreground = Design.color.liveText;
      extra = styles.ring;
      accessibilityText = "You're live";
      content = (
        <>
          <View style={styles.top}>
            <Text style={[Design.typography.caps, { color: foreground }]}>On air</Text>
            <Text style={[Design.typography.caps, { color: foreground }]}>{state.listeners} hear you</Text>
          </View>
          <LevelMeter level={state.level} bars={16} color={foreground} />
          <View style={styles.bottom}>
            <Text style={[Design.typography.headline, { color: foreground }]}>{'You’re\nlive'}</Text>
            <Timer startedAt={state.startedAt} color={foreground} warnColor={Design.color.weakText} />
          </View>
        </>
      );
      break;
    case 'local':
      background = Design.color.surface;
      foreground = Design.color.ink;
      extra = styles.outlined;
      accessibilityText = 'Recording';
      content = (
        <>
          <View style={styles.top}>
            <Text style={[Design.typography.caps, { color: foreground }]}>Recording</Text>
            <Text style={[Design.typography.caps, { color: Design.color.neutral700 }]}>
              {state.offline ? 'Sends when back online' : 'Sends when complete'}
            </Text>
          </View>
          <LevelMeter level={state.level} bars={16} color={foreground} />
          <View style={styles.bottom}>
            <Text style={[Design.typography.headline, { color: foreground }]}>{'Saving\nmessage'}</Text>
            <Timer startedAt={state.startedAt} color={foreground} warnColor={Design.color.offline} />
          </View>
        </>
      );
      break;
    case 'receiving':
      background = Design.color.talkBg;
      foreground = Design.color.talkText;
      accessibilityText = `${state.name} is talking`;
      content = (
        <>
          <Text style={[Design.typography.caps, { color: foreground }]}>Live</Text>
          <LevelMeter level={state.level} bars={12} color={foreground} />
          <View style={styles.bottom}>
            <View style={styles.flex}>
              <Text style={[Design.typography.speaker, { color: foreground }]} numberOfLines={1}>
                {state.name}
              </Text>
              <Text style={[Design.typography.bodyStrong, styles.talking]}>is talking…</Text>
            </View>
            <Timer startedAt={state.startedAt} color={foreground} />
          </View>
        </>
      );
      break;
    case 'micOff':
      background = Design.color.surface;
      foreground = Design.color.ink;
      extra = styles.outlined;
      accessibilityText = 'Microphone off. Open settings to allow it';
      content = (
        <>
          <Text style={[Design.typography.caps, { color: Design.color.neutral700 }]}>Microphone off</Text>
          <View style={styles.bottom}>
            <Text style={[Design.typography.headline, { color: foreground }]}>{'Allow\nmicrophone'}</Text>
            <MicOff size={32} color={foreground} strokeWidth={2} />
          </View>
        </>
      );
      break;
  }

  const micOff = state.kind === 'micOff';
  return (
    <Pressable
      onPressIn={micOff ? undefined : onPressIn}
      onPressOut={micOff ? undefined : onPressOut}
      onPress={micOff ? () => Linking.openSettings() : undefined}
      // A finger that drifts while talking must not end the transmission.
      pressRetentionOffset={{ top: 400, bottom: 200, left: 200, right: 200 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityText}
      accessibilityHint={micOff ? undefined : 'Hold to talk, release to stop'}
      style={[styles.button, { backgroundColor: background }, extra]}
    >
      {content}
    </Pressable>
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
  ring: { outlineWidth: 6, outlineStyle: 'solid', outlineColor: Design.color.liveRing },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall, height: 40 },
  meterBar: { width: 4, borderRadius: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  talking: { color: Design.color.talkSecondary, fontFamily: Design.fontFamily.semiBold, marginTop: Design.space.xsmall },
});
