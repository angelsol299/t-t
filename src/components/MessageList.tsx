import { useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAppSelector } from '@/store';
import { selectRows, type Row } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { MessageRow } from './MessageRow';

// Newest at the bottom, like a chat: an inverted list starts at the newest
// row and stays put when you scroll up to replay an older clip.

export function MessageList() {
  const rows = useAppSelector(selectRows);
  const playingId = useAppSelector((state) => (state.playback.current?.playing ? state.playback.current.messageId : null));
  // "Next" only shows while something is playing.
  const nextId = useAppSelector((state) => (state.playback.current?.playing ? (state.playback.queue[0] ?? null) : null));
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const list = useRef<FlatList<Row>>(null);

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

  return (
    <FlatList
      ref={list}
      inverted
      data={newestFirst}
      keyExtractor={(row) => row.id}
      style={styles.list}
      // Inverted, so the footer sits above the oldest row.
      ListFooterComponent={<Text style={[Design.typography.caps, styles.section]}>This shift · recorded</Text>}
      renderItem={({ item }) => <MessageRow row={item} playing={item.id === playingId} next={item.id === nextId} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  section: { color: Design.color.neutral700, paddingHorizontal: Design.space.large, paddingBottom: Design.space.small },
  empty: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: Design.space.large, paddingBottom: Design.space.regular },
});
