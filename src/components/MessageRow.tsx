import { AudioLines, Check, Mic, Pause, Play, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import type { Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { formatClockTime, formatDuration, formatSentAgo } from '@/utils/format';

interface Props {
  row: Row;
  playing: boolean; // this row is playing right now
  next: boolean; // next in the auto-play queue
}

function YouChip() {
  return (
    <View style={styles.you}>
      <Mic size={14} color={Design.color.ink} strokeWidth={2} />
      <Text style={styles.youText}>You</Text>
    </View>
  );
}

/** Clip length; while loaded in the player it doubles as the progress bar. */
function LengthPill({ messageId, ms }: { messageId: string; ms: number }) {
  const lengthLabel = formatDuration(ms);
  // Only the row loaded in the player gets a value here, so only it re-renders
  // on the 100ms progress ticks.
  const current = useAppSelector((state) => (state.playback.current?.messageId === messageId ? state.playback.current : null));
  const total = current?.durationMs || ms;
  const percent = current && total > 0 ? Math.min(100, (current.positionMs / total) * 100) : 0;

  return (
    <View
      style={[styles.length, current && styles.lengthActive]}
      accessible
      accessibilityLabel={
        current ? `Length ${lengthLabel}, ${formatDuration(current.positionMs)} played` : `Length ${lengthLabel}`
      }
    >
      {current && <View style={[styles.lengthFill, { width: `${percent}%` }]} />}
      <AudioLines size={12} color={Design.color.ink} strokeWidth={2.4} />
      <Text style={[Design.typography.pill, { color: Design.color.ink }]}>{lengthLabel}</Text>
    </View>
  );
}

/** "Sent 2 min ago": ticks on its own so the rest of the list doesn't re-render. */
function SentAgoTag({ at }: { at: number }) {
  const now = useNow(true, 30_000);
  return <Tag text={formatSentAgo(at, now)} background={Design.color.neutral200} foreground={Design.color.neutral700} />;
}

function Tag({ text, background, foreground, caps }: { text: string; background: string; foreground: string; caps?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <Text style={[caps ? styles.tagCaps : Design.typography.pill, { color: foreground }]}>{text}</Text>
    </View>
  );
}

function PlayButton({ playing, onPress, label }: { playing: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Design.space.xsmall}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      accessibilityHint={label}
      style={[styles.play, playing && styles.playActive]}
    >
      {playing ? (
        <Pause size={13} color={Design.color.liveText} fill={Design.color.liveText} strokeWidth={0} />
      ) : (
        <Play
          size={13}
          color={Design.color.ink}
          fill={Design.color.ink}
          strokeWidth={0}
          style={{ marginLeft: Design.space.xxsmall }}
        />
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

function MessageRowImpl({ row, playing, next }: Props) {
  const sender = row.mine ? (
    <YouChip />
  ) : (
    <Text style={[Design.typography.rowStrong, { color: Design.color.ink }]}>{row.name}</Text>
  );
  const senderDescription = row.mine ? 'Your message' : `Message from ${row.name}`;

  // Weak signal upload: stacked row with progress (05).
  if (row.receipt.kind === 'sending' && row.receipt.percent !== null) {
    return (
      <View style={styles.stack} accessible accessibilityLabel={`${senderDescription}, sending ${row.receipt.percent} percent`}>
        <View style={styles.stackHead}>
          {sender}
          <Text
            style={[
              Design.typography.rowStrong,
              styles.tabular,
              { color: Design.color.weakText, fontFamily: Design.fontFamily.semiBold },
            ]}
          >
            Sending {row.receipt.percent}%
          </Text>
        </View>
        <Bar percent={row.receipt.percent} track={Design.color.weakBg} fill={Design.color.weakText} />
      </View>
    );
  }

  let meta: React.ReactNode;
  switch (row.receipt.kind) {
    case 'time':
      meta = <Text style={styles.meta}>{next ? `Next · ${formatClockTime(row.at)}` : formatClockTime(row.at)}</Text>;
      break;
    case 'heard':
      meta = (
        <View style={styles.metaRow}>
          {row.receipt.heardBy > 0 && <Check size={14} color={Design.color.backText} strokeWidth={2.4} />}
          <Text style={styles.meta}>
            {row.receipt.heardBy > 0 ? `Heard by ${row.receipt.heardBy} · ${formatClockTime(row.at)}` : formatClockTime(row.at)}
          </Text>
        </View>
      );
      break;
    case 'sending':
      meta = <Text style={styles.meta}>Sending… · {formatClockTime(row.at)}</Text>;
      break;
    case 'queued':
      meta = <Tag text="Not sent yet" background={Design.color.offlineBg} foreground={Design.color.offline} />;
      break;
    case 'failed':
      meta = (
        <Pressable
          onPress={() => registry.controller?.retryClip(row.id)}
          accessibilityRole="button"
          accessibilityLabel="Not sent. Tap to retry"
        >
          <Tag text="Not sent · Retry" background={Design.color.offlineBg} foreground={Design.color.offline} />
        </Pressable>
      );
      break;
  }

  const deletable = row.pending && (row.receipt.kind === 'queued' || row.receipt.kind === 'failed');

  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        {sender}
        {row.missed && <Tag text="MISSED" background={Design.color.offlineBg} foreground={Design.color.offline} caps />}
        <LengthPill messageId={row.id} ms={row.durationMs} />
        {row.late && <SentAgoTag at={row.at} />}
        {row.cutShort && <Tag text="Cut short" background={Design.color.neutral200} foreground={Design.color.neutral700} />}
      </View>
      {meta}
      {deletable && (
        <Pressable
          onPress={() => registry.controller?.deleteQueued(row.id)}
          style={styles.delete}
          accessibilityRole="button"
          accessibilityLabel="Delete"
          accessibilityHint="Deletes this unsent message"
        >
          <Trash2 size={16} color={Design.color.offline} strokeWidth={2} />
        </Pressable>
      )}
      <PlayButton playing={playing} onPress={() => registry.controller?.togglePlay(row.id)} label={senderDescription} />
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.medium,
    minHeight: 48,
    paddingVertical: Design.space.xsmall,
    paddingLeft: Design.space.large,
    paddingRight: Design.space.small,
    borderTopWidth: 1,
    borderTopColor: Design.color.neutral300,
  },
  lead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Design.space.small, flexWrap: 'wrap' },
  stack: {
    gap: Design.space.small,
    paddingVertical: Design.space.medium,
    paddingHorizontal: Design.space.large,
    borderTopWidth: 1,
    borderTopColor: Design.color.neutral300,
  },
  stackHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  you: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.xsmall,
    paddingVertical: Design.space.xsmall,
    paddingHorizontal: Design.space.small,
    borderRadius: Design.radius.pill,
    backgroundColor: Design.color.neutral200,
  },
  youText: { fontFamily: Design.fontFamily.bold, fontSize: Design.fontSize.xxsmall, color: Design.color.ink },
  length: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Design.space.xsmall,
    paddingVertical: Design.space.xxsmall,
    paddingHorizontal: Design.space.small,
    borderRadius: Design.radius.pill,
    borderWidth: 1.5,
    borderColor: Design.color.neutral300,
    overflow: 'hidden',
  },
  lengthActive: { borderColor: Design.color.live },
  lengthFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Design.color.live,
  },
  tag: { paddingVertical: Design.space.xsmall, paddingHorizontal: Design.space.small, borderRadius: Design.radius.pill },
  tagCaps: {
    fontFamily: Design.fontFamily.semiBold,
    fontSize: Design.fontSize.xxxxsmall,
    letterSpacing: Design.letterSpacing(0.08, Design.fontSize.xxxxsmall),
  },
  meta: { ...Design.typography.row, color: Design.color.neutral700, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall },
  tabular: { fontVariant: ['tabular-nums'] },
  // 36px visual, padded to a 44px hit area by the row padding + hitSlop
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Design.color.white,
    borderWidth: 1.5,
    borderColor: Design.color.neutral300,
  },
  playActive: { backgroundColor: Design.color.live, borderColor: Design.color.live },
  delete: {
    width: Design.layout.minimumTouchTarget,
    height: Design.layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Design.space.small,
  },
  bar: { height: 4, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
