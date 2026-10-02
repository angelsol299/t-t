import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectRows, type Row } from '@/store/selectors';
import { colors, type } from '@/theme/tokens';
import { MessageRow } from './MessageRow';

// Newest at the bottom, like a chat: an inverted list starts at the newest
// row and stays put when you scroll up to replay an older clip.

export function MessageList() {
  const rows = useAppSelector(selectRows);
  const playback = useAppSelector((state) => state.playback);
  const now = useNow(rows.some((row) => row.late), 30_000);
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const list = useRef<FlatList<Row>>(null);

  const onPlay = useCallback((id: string) => registry.controller?.togglePlay(id), []);
  const onDelete = useCallback((id: string) => registry.controller?.deleteQueued(id), []);
  const onRetry = useCallback((id: string) => registry.controller?.retryClip(id), []);

  useEffect(() => {
    // A new message brings the newest row back into view.
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[type.meta, { color: colors.neutral700 }]}>No messages this shift yet</Text>
      </View>
    );
  }

  const nextId = playback.current?.playing ? playback.queue[0] : undefined;

  return (
    <FlatList
      ref={list}
      inverted
      data={newestFirst}
      keyExtractor={(row) => row.id}
      style={styles.list}
      // Inverted, so the footer sits above the oldest row.
      ListFooterComponent={<Text style={[type.caps, styles.section]}>This shift · recorded</Text>}
      renderItem={({ item }) => (
        <MessageRow
          row={item}
          now={now}
          play={{
            current: playback.current?.messageId === item.id,
            playing: playback.current?.messageId === item.id && playback.current.playing,
            positionMs: playback.current?.messageId === item.id ? playback.current.positionMs : 0,
            durationMs: playback.current?.messageId === item.id ? playback.current.durationMs : 0,
            next: nextId === item.id,
          }}
          onPlay={onPlay}
          onDelete={onDelete}
          onRetry={onRetry}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  section: { color: colors.neutral700, paddingHorizontal: 20, paddingBottom: 10 },
  empty: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 16 },
});
