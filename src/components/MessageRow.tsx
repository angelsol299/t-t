import { AudioLines, Check, Mic, Pause, Play, Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectPlaybackOf, type Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { formatClockTime, formatDuration, formatSentAgo } from '@/utils/format';

// One message in the list. Most rows read left to right:
//
//   [sender] [MISSED] [0:12] [Sent 2 min ago] [Cut short]    receipt   [delete] [play]
//
// On a weak link, my clip being uploaded shows as a progress bar instead (05).

interface Props {
  row: Row;
  playing: boolean; // this row is playing right now
  next: boolean; // next in the auto-play queue
}

function MessageRowImpl({ row, playing, next }: Props) {
  if (row.receipt.kind === 'sending' && row.receipt.percent !== null) {
    return <UploadingRow row={row} percent={row.receipt.percent} />;
  }

  // Only my unsent clips can be deleted.
  const deletable = row.receipt.kind === 'queued' || row.receipt.kind === 'failed';

  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        <Sender row={row} />
        {row.missed && <Tag text="MISSED" tone="alert" caps />}
        <LengthPill messageId={row.id} ms={row.durationMs} />
        {row.late && <SentAgoTag at={row.at} />}
        {row.cutShort && <Tag text="Cut short" tone="neutral" />}
      </View>
      <Receipt row={row} next={next} />
      {deletable && <DeleteButton clipId={row.id} />}
      <PlayButton playing={playing} onPress={() => registry.controller?.togglePlay(row.id)} label={describeSender(row)} />
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);

/** 05: my clip uploading on a weak link, with its progress. */
function UploadingRow({ row, percent }: { row: Row; percent: number }) {
  return (
    <View style={styles.uploading} accessible accessibilityLabel={`${describeSender(row)}, sending ${percent} percent`}>
      <View style={styles.uploadingHead}>
        <Sender row={row} />
        <Text style={styles.uploadingText}>Sending {percent}%</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, percent))}%` }]} />
      </View>
    </View>
  );
}

function describeSender(row: Row) {
  return row.mine ? 'Your message' : `Message from ${row.name}`;
}

function Sender({ row }: { row: Row }) {
  if (!row.mine) return <Text style={styles.senderName}>{row.name}</Text>;
  return (
    <View style={styles.you}>
      <Mic size={14} color={Design.color.ink} strokeWidth={2} />
      <Text style={styles.youText}>You</Text>
    </View>
  );
}

/** The text after the tags: the time, "Heard by N", or how my unsent clip is doing. */
function Receipt({ row, next }: { row: Row; next: boolean }) {
  const time = formatClockTime(row.at);
  switch (row.receipt.kind) {
    case 'time':
      return <Text style={styles.meta}>{next ? `Next · ${time}` : time}</Text>;
    case 'heard': {
      const { heardBy } = row.receipt;
      if (heardBy === 0) return <Text style={styles.meta}>{time}</Text>;
      return (
        <View style={styles.metaRow}>
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

/** Clip length; while loaded in the player it doubles as the progress bar. */
function LengthPill({ messageId, ms }: { messageId: string; ms: number }) {
  const lengthLabel = formatDuration(ms);
  // Only the row loaded in the player gets a value here, so only it re-renders
  // on the 100ms progress ticks.
  const current = useAppSelector((state) => selectPlaybackOf(state, messageId));
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
      <Text style={styles.lengthText}>{lengthLabel}</Text>
    </View>
  );
}

/** "Sent 2 min ago": ticks on its own so the rest of the list doesn't re-render. */
function SentAgoTag({ at }: { at: number }) {
  const now = useNow(30_000);
  return <Tag text={formatSentAgo(at, now)} tone="neutral" />;
}

/** A small pill: red for problems (MISSED, Not sent), grey for information. */
function Tag({ text, tone, caps }: { text: string; tone: 'alert' | 'neutral'; caps?: boolean }) {
  const alert = tone === 'alert';
  return (
    <View style={[styles.tag, alert ? styles.tagAlert : styles.tagNeutral]}>
      <Text style={[caps ? styles.tagCaps : styles.tagText, alert ? styles.tagAlertText : styles.tagNeutralText]}>{text}</Text>
    </View>
  );
}

/** Deleting an unsent clip loses it for good, and the button sits next to Play, so it asks first. */
function DeleteButton({ clipId }: { clipId: string }) {
  const confirmDelete = () =>
    Alert.alert('Delete this message?', 'It has not been sent yet, so nobody will hear it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => registry.controller?.deleteQueued(clipId) },
    ]);
  return (
    <Pressable
      onPress={confirmDelete}
      style={styles.delete}
      accessibilityRole="button"
      accessibilityLabel="Delete"
      accessibilityHint="Deletes this unsent message"
    >
      <Trash2 size={16} color={Design.color.offline} strokeWidth={2} />
    </Pressable>
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
        <Play size={13} color={Design.color.ink} fill={Design.color.ink} strokeWidth={0} style={styles.playIcon} />
      )}
    </Pressable>
  );
}

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
  senderName: { ...Design.typography.rowStrong, color: Design.color.ink },
  uploading: {
    gap: Design.space.small,
    paddingVertical: Design.space.medium,
    paddingHorizontal: Design.space.large,
    borderTopWidth: 1,
    borderTopColor: Design.color.neutral300,
  },
  uploadingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  uploadingText: {
    ...Design.typography.rowStrong,
    fontFamily: Design.fontFamily.semiBold,
    fontVariant: ['tabular-nums'],
    color: Design.color.weakText,
  },
  bar: { height: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: Design.color.weakBg },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: Design.color.weakText },
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
  lengthText: { ...Design.typography.pill, color: Design.color.ink },
  lengthFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Design.color.live,
  },
  tag: { paddingVertical: Design.space.xsmall, paddingHorizontal: Design.space.small, borderRadius: Design.radius.pill },
  tagAlert: { backgroundColor: Design.color.offlineBg },
  tagNeutral: { backgroundColor: Design.color.neutral200 },
  tagText: Design.typography.pill,
  tagAlertText: { color: Design.color.offline },
  tagNeutralText: { color: Design.color.neutral700 },
  tagCaps: {
    fontFamily: Design.fontFamily.semiBold,
    fontSize: Design.fontSize.xxxxsmall,
    letterSpacing: Design.letterSpacing(0.08, Design.fontSize.xxxxsmall),
  },
  meta: { ...Design.typography.row, color: Design.color.neutral700, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Design.space.xsmall },
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
  playIcon: { marginLeft: Design.space.xxsmall }, // optically centres the triangle
  delete: {
    width: Design.layout.minimumTouchTarget,
    height: Design.layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Design.space.small,
  },
});
