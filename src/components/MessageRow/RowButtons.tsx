import { Pause, Play, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { registry } from '@/services/registry';
import { Design } from '@/theme/Design';

interface PlayButtonProps {
  playing: boolean;
  onPress: () => void;
  /** Read after "Play" / "Pause" by screen readers, e.g. "Message from Anna". */
  label: string;
}

export function PlayButton({ playing, onPress, label }: PlayButtonProps) {
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

/** Deleting an unsent clip loses it for good, and the button sits next to Play, so it asks first. */
export function DeleteButton({ clipId }: { clipId: string }) {
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

const styles = StyleSheet.create({
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
