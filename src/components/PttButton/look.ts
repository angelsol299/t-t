import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { PushToTalkState } from '@/store/selectors';
import { Design } from '@/theme/Design';

/** The button's colours and frame in each state. The face's text and icons use `foreground`. */
export interface Look {
  background: string;
  foreground: string;
  frame?: StyleProp<ViewStyle>;
}

const SOLID: Look = { background: Design.color.ink, foreground: Design.color.ground };

// Outlined means "not reaching anyone right now": offline, recording to send later, mic off.
const OUTLINED: Look = { background: Design.color.surface, foreground: Design.color.ink };

export function lookFor(state: PushToTalkState): Look {
  switch (state.kind) {
    case 'idle':
      return state.offline ? { ...OUTLINED, frame: styles.outlined } : SOLID;
    case 'pending':
      return { ...SOLID, frame: styles.pending };
    case 'live':
      return { background: Design.color.live, foreground: Design.color.liveText, frame: styles.ring };
    case 'local':
    case 'micOff':
      return { ...OUTLINED, frame: styles.outlined };
    case 'receiving':
      return { background: Design.color.talkBg, foreground: Design.color.talkText };
  }
}

const styles = StyleSheet.create({
  outlined: { borderWidth: 2, borderColor: Design.color.neutral300 },
  pending: { opacity: 0.88 },
  ring: { outlineWidth: 6, outlineStyle: 'solid', outlineColor: Design.color.liveRing },
});
