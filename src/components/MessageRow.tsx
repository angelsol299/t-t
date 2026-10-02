import { AudioLines, Check, Mic, Pause, Play, Trash2 } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Row } from '@/store/selectors';
import { colors, fonts, MIN_TOUCH_TARGET, radii, tracking, type } from '@/theme/tokens';
import { clock, duration, sentAgo } from '@/utils/format';

export interface RowPlayState {
  playing: boolean;
  current: boolean; // this row is the one loaded in the player
  positionMs: number;
  durationMs: number; // length of the decoded audio actually playing
  next: boolean; // next in the auto-play queue
}

interface Props {
  row: Row;
  play: RowPlayState;
  now: number;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

function YouChip() {
  return (
    <View style={styles.you}>
      <Mic size={14} color={colors.ink} strokeWidth={2} />
      <Text style={styles.youText}>You</Text>
    </View>
  );
}

/**
 * Clip length; while loaded in the player it doubles as the progress bar.
 * The fill runs as one native animation timed to the remaining audio, so it
 * lands on 100% exactly as playback ends. Progress ticks (every 100ms) only
 * resync it on start, pause and resume.
 */
function LengthPill({ ms, play }: { ms: number; play?: RowPlayState }) {
  const lengthLabel = duration(ms);
  const [progress] = useState(() => new Animated.Value(0));
  const active = !!play;
  const playing = !!play?.playing;
  const total = play?.durationMs || ms;
  const position = useRef(0);

  useEffect(() => {
    position.current = play?.positionMs ?? 0;
  });

  useEffect(() => {
    if (!active || total <= 0) {
      progress.setValue(0);
      return;
    }
    const from = Math.min(1, position.current / total);
    progress.setValue(from);
    if (!playing) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, total * (1 - from)),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, playing, total, progress]);

  return (
    <View
      style={[styles.length, active && styles.lengthActive]}
      accessible
      accessibilityLabel={active ? `Length ${lengthLabel}, ${duration(play.positionMs)} played` : `Length ${lengthLabel}`}
    >
      {active && <Animated.View style={[styles.lengthFill, { transform: [{ scaleX: progress }] }]} />}
      <AudioLines size={12} color={colors.ink} strokeWidth={2.4} />
      <Text style={[type.pill, { color: colors.ink }]}>{lengthLabel}</Text>
    </View>
  );
}

function Tag({ text, background, foreground, caps }: { text: string; background: string; foreground: string; caps?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <Text style={[caps ? styles.tagCaps : type.pill, { color: foreground }]}>{text}</Text>
    </View>
  );
}

function PlayButton({ playing, onPress, label }: { playing: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      accessibilityHint={label}
      style={[styles.play, playing && styles.playActive]}
    >
      {playing ? (
        <Pause size={13} color={colors.liveText} fill={colors.liveText} strokeWidth={0} />
      ) : (
        <Play size={13} color={colors.ink} fill={colors.ink} strokeWidth={0} style={{ marginLeft: 2 }} />
      )}
    </Pressable>
  );
}

function Bar({ percent, track, fill }: { percent: number; track: string; fill: string }) {
  return (
    <View style={[styles.bar, { backgroundColor: track }]}>
      <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: fill }]} />
    </View>
  );
}

function MessageRowImpl({ row, play, now, onPlay, onDelete, onRetry }: Props) {
  const sender = row.mine ? <YouChip /> : <Text style={[type.rowStrong, { color: colors.ink }]}>{row.name}</Text>;
  const senderDescription = row.mine ? 'Your message' : `Message from ${row.name}`;

  // Weak signal upload: stacked row with progress (05).
  if (row.receipt.kind === 'sending' && row.receipt.percent !== null) {
    return (
      <View style={styles.stack} accessible accessibilityLabel={`${senderDescription}, sending ${row.receipt.percent} percent`}>
        <View style={styles.stackHead}>
          {sender}
          <Text style={[type.rowStrong, styles.tabular, { color: colors.weakText, fontFamily: fonts.semiBold }]}>
            Sending {row.receipt.percent}%
          </Text>
        </View>
        <Bar percent={row.receipt.percent} track={colors.weakBg} fill={colors.weakText} />
      </View>
    );
  }

  let meta: React.ReactNode;
  switch (row.receipt.kind) {
    case 'time':
      meta = <Text style={styles.meta}>{play.next ? `Next · ${clock(row.at)}` : clock(row.at)}</Text>;
      break;
    case 'heard':
      meta = (
        <View style={styles.metaRow}>
          {row.receipt.n > 0 && <Check size={14} color={colors.backText} strokeWidth={2.4} />}
          <Text style={styles.meta}>
            {row.receipt.n > 0 ? `Heard by ${row.receipt.n} · ${clock(row.at)}` : clock(row.at)}
          </Text>
        </View>
      );
      break;
    case 'sending':
      meta = <Text style={styles.meta}>Sending… · {clock(row.at)}</Text>;
      break;
    case 'queued':
      meta = <Tag text="Not sent yet" background={colors.offlineBg} foreground={colors.offline} />;
      break;
    case 'failed':
      meta = (
        <Pressable onPress={() => onRetry(row.id)} accessibilityRole="button" accessibilityLabel="Not sent. Tap to retry">
          <Tag text="Not sent · Retry" background={colors.offlineBg} foreground={colors.offline} />
        </Pressable>
      );
      break;
  }

  const deletable = row.pending && (row.receipt.kind === 'queued' || row.receipt.kind === 'failed');

  return (
    <View style={[styles.row0, styles.row]}>
      <View style={styles.lead}>
        {sender}
        {row.missed && <Tag text="MISSED" background={colors.offlineBg} foreground={colors.offline} caps />}
        <LengthPill ms={row.durationMs} play={play.current ? play : undefined} />
        {row.late && <Tag text={sentAgo(row.at, now)} background={colors.neutral200} foreground={colors.neutral700} />}
        {row.cutShort && <Tag text="Cut short" background={colors.neutral200} foreground={colors.neutral700} />}
      </View>
      {meta}
      {deletable && (
        <Pressable
          onPress={() => onDelete(row.id)}
          style={styles.delete}
          accessibilityRole="button"
          accessibilityLabel="Delete"
          accessibilityHint="Deletes this unsent message"
        >
          <Trash2 size={16} color={colors.offline} strokeWidth={2} />
        </Pressable>
      )}
      <PlayButton playing={play.playing} onPress={() => onPlay(row.id)} label={senderDescription} />
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);

const styles = StyleSheet.create({
  row0: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: {
    minHeight: 48,
    paddingVertical: 6,
    paddingLeft: 20,
    paddingRight: 6,
    borderTopWidth: 1,
    borderTopColor: colors.neutral300,
  },
  lead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stack: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.neutral300,
  },
  stackHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  you: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.neutral200,
  },
  youText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  length: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.neutral300,
    overflow: 'hidden',
  },
  lengthActive: { borderColor: colors.live },
  lengthFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    transformOrigin: 'left',
    backgroundColor: colors.live,
  },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill },
  tagCaps: { fontFamily: fonts.semiBold, fontSize: 11, letterSpacing: tracking(0.08, 11) },
  meta: { ...type.row, color: colors.neutral700, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  // 36px visual, padded to a 44px hit area by the row padding + hitSlop
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.neutral300,
  },
  playActive: { backgroundColor: colors.live, borderColor: colors.live },
  delete: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  bar: { height: 4, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
