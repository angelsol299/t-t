import { Mic } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { registry } from '@/services/registry';
import type { Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { LengthPill } from './LengthPill';
import { Receipt } from './Receipt';
import { DeleteButton, PlayButton } from './RowButtons';
import { SentAgoTag, Tag } from './Tag';

// One message in the list. Most rows read left to right:
//
//   [sender] [MISSED] [0:12] [Sent 2 min ago] [Cut short]    receipt   [delete] [play]
//              Tag    LengthPill  SentAgoTag      Tag        Receipt     RowButtons
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

/** The sender's name, or a "You" chip on my own messages. */
function Sender({ row }: { row: Row }) {
  if (!row.mine) return <Text style={styles.senderName}>{row.name}</Text>;
  return (
    <View style={styles.you}>
      <Mic size={14} color={Design.color.ink} strokeWidth={2} />
      <Text style={styles.youText}>You</Text>
    </View>
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
});
