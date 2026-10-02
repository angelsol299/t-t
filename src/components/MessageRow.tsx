import { AudioLines, Check, Mic, Pause, Play, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Row } from '@/store/selectors';
import { colors, fonts, HIT, radii, tracking, type } from '@/theme/tokens';
import { clock, duration, sentAgo } from '@/utils/format';

export interface RowPlayState {
  playing: boolean;
  current: boolean; // this row is the one loaded in the player
  positionMs: number;
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

function LengthPill({ ms }: { ms: number }) {
  const d = duration(ms);
  return (
    <View style={styles.length} accessible accessibilityLabel={`Length ${d}`}>
      <AudioLines size={12} color={colors.ink} strokeWidth={2.4} />
      <Text style={[type.pill, { color: colors.ink }]}>{d}</Text>
    </View>
  );
}

function Tag({ text, bg, fg, caps }: { text: string; bg: string; fg: string; caps?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[caps ? styles.tagCaps : type.pill, { color: fg }]}>{text}</Text>
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

function Bar({ pct, track, fill }: { pct: number; track: string; fill: string }) {
  return (
    <View style={[styles.bar, { backgroundColor: track }]}>
      <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: fill }]} />
    </View>
  );
}

function MessageRowImpl({ row, play, now, onPlay, onDelete, onRetry }: Props) {
  const who = row.mine ? <YouChip /> : <Text style={[type.rowStrong, { color: colors.ink }]}>{row.name}</Text>;
  const a11yWho = row.mine ? 'Your message' : `Message from ${row.name}`;

  // Weak signal upload: stacked row with progress (05).
  if (row.receipt.kind === 'sending' && row.receipt.pct !== null) {
    return (
      <View style={styles.stack} accessible accessibilityLabel={`${a11yWho}, sending ${row.receipt.pct} percent`}>
        <View style={styles.stackHead}>
          {who}
          <Text style={[type.rowStrong, styles.tabular, { color: colors.weakText, fontFamily: fonts.w600 }]}>
            Sending {row.receipt.pct}%
          </Text>
        </View>
        <Bar pct={row.receipt.pct} track={colors.weakBg} fill={colors.weakText} />
      </View>
    );
  }

  // Currently playing: green dot, PLAYING, position, pause, progress (07).
  if (play.current) {
    const pct = row.durationMs > 0 ? (play.positionMs / row.durationMs) * 100 : 0;
    return (
      <View style={[styles.stack, styles.playingStack]}>
        <View style={styles.row0}>
          <View style={styles.lead}>
            <View style={styles.greenDot} />
            {row.mine ? <YouChip /> : <Text style={[type.rowStrong, { color: colors.ink }]}>{row.name}</Text>}
            <Text style={[styles.tagCaps, { color: colors.backText }]}>{play.playing ? 'PLAYING' : 'PAUSED'}</Text>
          </View>
          <Text style={[type.row, styles.tabular, { color: colors.ink }]}>
            {duration(play.positionMs)} / {duration(row.durationMs)}
          </Text>
          <PlayButton playing={play.playing} onPress={() => onPlay(row.id)} label={a11yWho} />
        </View>
        <Bar pct={pct} track={colors.n300} fill={colors.live} />
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
      meta = <Tag text="Not sent yet" bg={colors.offlineBg} fg={colors.offline} />;
      break;
    case 'failed':
      meta = (
        <Pressable onPress={() => onRetry(row.id)} accessibilityRole="button" accessibilityLabel="Not sent. Tap to retry">
          <Tag text="Not sent · Retry" bg={colors.offlineBg} fg={colors.offline} />
        </Pressable>
      );
      break;
  }

  const deletable = row.pending && (row.receipt.kind === 'queued' || row.receipt.kind === 'failed');

  return (
    <View style={[styles.row0, styles.row]}>
      <View style={styles.lead}>
        {who}
        {row.missed && <Tag text="MISSED" bg={colors.offlineBg} fg={colors.offline} caps />}
        <LengthPill ms={row.durationMs} />
        {row.late && <Tag text={sentAgo(row.at, now)} bg={colors.n200} fg={colors.n700} />}
        {row.cutShort && <Tag text="Cut short" bg={colors.n200} fg={colors.n700} />}
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
      <PlayButton playing={false} onPress={() => onPlay(row.id)} label={a11yWho} />
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
    borderTopColor: colors.n300,
  },
  lead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stack: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.n300,
  },
  playingStack: { gap: 8, paddingTop: 6, paddingRight: 6, paddingBottom: 12 },
  stackHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  you: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.n200,
  },
  youText: { fontFamily: fonts.w700, fontSize: 13, color: colors.ink },
  length: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.n300,
  },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill },
  tagCaps: { fontFamily: fonts.w600, fontSize: 11, letterSpacing: tracking(0.08, 11) },
  meta: { ...type.row, color: colors.n700, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  // 36px visual, padded to a 44px hit area by the row padding + hitSlop
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.n300,
  },
  playActive: { backgroundColor: colors.live, borderColor: colors.live },
  delete: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  bar: { height: 4, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
