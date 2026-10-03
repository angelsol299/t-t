import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectNowPlaying, selectRows, type Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { IDLE_PLAY_STATE, MessageRow, NEXT_PLAY_STATE, type RowPlayState } from './MessageRow';

// Newest at the bottom, like a chat: an inverted list starts at the newest
// row and stays put when you scroll up to replay an older clip.

export function MessageList() {
  const rows = useAppSelector(selectRows);
  const nowPlaying = useAppSelector(selectNowPlaying);
  const now = useNow(
    rows.some((row) => row.late),
    30_000,
  );
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const list = useRef<FlatList<Row>>(null);
  // One object for the row in the player, so memo() still skips the other rows.
  const currentPlayState = useMemo<RowPlayState>(
    () => ({ current: true, playing: nowPlaying.playing, durationMs: nowPlaying.durationMs, next: false }),
    [nowPlaying.playing, nowPlaying.durationMs],
  );

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
        <Text style={[Design.typography.meta, { color: Design.color.neutral700 }]}>No messages this shift yet</Text>
      </View>
    );
  }

  const playStateFor = (messageId: string): RowPlayState => {
    if (messageId === nowPlaying.messageId) return currentPlayState;
    if (messageId === nowPlaying.nextMessageId) return NEXT_PLAY_STATE;
    return IDLE_PLAY_STATE;
  };

  return (
    <FlatList
      ref={list}
      inverted
      data={newestFirst}
      keyExtractor={(row) => row.id}
      style={styles.list}
      // Inverted, so the footer sits above the oldest row.
      ListFooterComponent={<Text style={[Design.typography.caps, styles.section]}>This shift · recorded</Text>}
      renderItem={({ item }) => (
        <MessageRow row={item} now={now} play={playStateFor(item.id)} onPlay={onPlay} onDelete={onDelete} onRetry={onRetry} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  section: { color: Design.color.neutral700, paddingHorizontal: Design.space.large, paddingBottom: Design.space.small },
  empty: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: Design.space.large, paddingBottom: Design.space.regular },
});
