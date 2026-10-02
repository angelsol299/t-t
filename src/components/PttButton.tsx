import { Mic, MicOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { debugTrace } from '@/utils/debugTrace'; // TEMP DEBUG
import { MAX_CLIP_MS } from '@shared/protocol';
import { colors, fonts, radii, type } from '@/theme/tokens';
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
  debugTrace.log('timer-render', { elapsed }); // TEMP DEBUG
  const warn = warnColor && MAX_CLIP_MS - elapsed <= 10_000;
  return <Text style={[type.headline, styles.tabular, { color: warn ? warnColor : color }]}>{duration(elapsed)}</Text>;
}

export function PttButton({ state, onPressIn, onPressOut }: Props) {
  let background: string = colors.ink;
  let foreground: string = colors.ground;
  let extra: object | null = null;
  let content: React.ReactNode;
  let accessibilityText = 'Push to talk';

  switch (state.kind) {
    case 'idle':
    case 'pending':
      if (state.kind === 'idle' && state.offline) {
        background = colors.surface;
        foreground = colors.ink;
        extra = styles.outlined;
      }
      content = (
        <>
          <Text style={[type.caps, { color: foreground }]}>
            {state.kind === 'idle' && state.offline ? 'Sends when back online' : 'Push to talk'}
          </Text>
          <View style={styles.bottom}>
            <Text style={[type.headline, { color: foreground }]}>{'Hold\nto talk'}</Text>
            <Mic size={32} color={foreground} strokeWidth={2} />
          </View>
        </>
      );
      if (state.kind === 'pending') extra = { opacity: 0.88 };
      break;
    case 'live':
      background = colors.live;
      foreground = colors.liveText;
      extra = styles.ring;
      accessibilityText = "You're live";
      content = (
        <>
          <View style={styles.top}>
            <Text style={[type.caps, { color: foreground }]}>On air</Text>
            <Text style={[type.caps, { color: foreground }]}>{state.listeners} hear you</Text>
          </View>
          <LevelMeter level={state.level} bars={16} color={foreground} />
          <View style={styles.bottom}>
            <Text style={[type.headline, { color: foreground }]}>{'You’re\nlive'}</Text>
            <Timer startedAt={state.startedAt} color={foreground} warnColor={colors.weakText} />
          </View>
        </>
      );
      break;
    case 'local':
      background = colors.surface;
      foreground = colors.ink;
      extra = styles.outlined;
      accessibilityText = 'Recording';
      content = (
        <>
          <View style={styles.top}>
            <Text style={[type.caps, { color: foreground }]}>Recording</Text>
            <Text style={[type.caps, { color: colors.neutral700 }]}>
              {state.offline ? 'Sends when back online' : 'Sends when complete'}
            </Text>
          </View>
          <LevelMeter level={state.level} bars={16} color={foreground} />
          <View style={styles.bottom}>
            <Text style={[type.headline, { color: foreground }]}>{'Saving\nmessage'}</Text>
            <Timer startedAt={state.startedAt} color={foreground} warnColor={colors.offline} />
          </View>
        </>
      );
      break;
    case 'receiving':
      background = colors.talkBg;
      foreground = colors.talkText;
      accessibilityText = `${state.name} is talking`;
      content = (
        <>
          <Text style={[type.caps, { color: foreground }]}>Live</Text>
          <LevelMeter level={state.level} bars={12} color={foreground} />
          <View style={styles.bottom}>
            <View style={styles.flex}>
              <Text style={[type.speaker, { color: foreground }]} numberOfLines={1}>
                {state.name}
              </Text>
              <Text style={[type.bodyStrong, styles.talking]}>is talking…</Text>
            </View>
            <Timer startedAt={state.startedAt} color={foreground} />
          </View>
        </>
      );
      break;
    case 'micOff':
      background = colors.surface;
      foreground = colors.ink;
      extra = styles.outlined;
      accessibilityText = 'Microphone off. Open settings to allow it';
      content = (
        <>
          <Text style={[type.caps, { color: colors.neutral700 }]}>Microphone off</Text>
          <View style={styles.bottom}>
            <Text style={[type.headline, { color: foreground }]}>{'Allow\nmicrophone'}</Text>
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
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: radii.phone,
    padding: 22,
    justifyContent: 'space-between',
  },
  outlined: { borderWidth: 2, borderColor: colors.neutral300 },
  ring: { outlineWidth: 6, outlineStyle: 'solid', outlineColor: colors.liveRing },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 40 },
  meterBar: { width: 4, borderRadius: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  talking: { color: colors.talkSecondary, fontFamily: fonts.semiBold, marginTop: 4 },
});
