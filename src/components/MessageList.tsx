import { useCallback, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useController } from '@/hooks/useController';
import { useNow } from '@/hooks/useNow';
import { useDeleteQueuedMutation, useRetryClipMutation } from '@/store/api/channelApi';
import { useAppSelector } from '@/store';
import { selectRows, type Row } from '@/store/selectors';
import { colors, type } from '@/theme/tokens';
import { MessageRow } from './MessageRow';

// Newest at the bottom, like a chat: the list is pinned to the button.

export function MessageList() {
  const rows = useAppSelector(selectRows);
  const pb = useAppSelector((s) => s.playback);
  const controller = useController();
  const [deleteQueued] = useDeleteQueuedMutation();
  const [retryClip] = useRetryClipMutation();
  const now = useNow(rows.some((r) => r.late), 30_000);
  const list = useRef<FlatList<Row>>(null);
  // Follow the end like a chat: content growth keeps the list pinned only
  // while the user is already at the bottom, or when a new message arrives.
  // Scrolled up to replay an older clip, nothing yanks the view away.
  const atBottom = useRef(true);
  const pinnedFor = useRef(0);

  const onPlay = useCallback((id: string) => controller.togglePlay(id), [controller]);
  const onDelete = useCallback((id: string) => void deleteQueued(id), [deleteQueued]);
  const onRetry = useCallback((id: string) => void retryClip(id), [retryClip]);

  useEffect(() => {
    // Keep the newest message in view as rows arrive.
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[type.meta, { color: colors.n700 }]}>No messages this shift yet</Text>
      </View>
    );
  }

  const nextId = pb.current?.playing ? pb.queue[0] : undefined;

  return (
    <FlatList
      ref={list}
      data={rows}
      keyExtractor={(r) => r.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<Text style={[type.caps, styles.section]}>This shift · recorded</Text>}
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 24;
      }}
      scrollEventThrottle={64}
      onContentSizeChange={() => {
        if (!atBottom.current && pinnedFor.current === rows.length) return;
        pinnedFor.current = rows.length;
        list.current?.scrollToEnd({ animated: false });
      }}
      renderItem={({ item }) => (
        <MessageRow
          row={item}
          now={now}
          play={{
            current: pb.current?.msgId === item.id,
            playing: pb.current?.msgId === item.id && pb.current.playing,
            positionMs: pb.current?.msgId === item.id ? pb.current.positionMs : 0,
            durationMs: pb.current?.msgId === item.id ? pb.current.durationMs : 0,
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
  content: { flexGrow: 1, justifyContent: 'flex-end' },
  section: { color: colors.n700, paddingHorizontal: 20, paddingBottom: 10 },
  empty: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 16 },
});
