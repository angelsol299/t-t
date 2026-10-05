import type { PushToTalkState } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Face } from './Faces';
import { lookFor } from './look';
import { accessibilityLabelFor } from './utils';

// The big push-to-talk button. This file is the touch target; the rest of the
// folder is what it shows:
//
//   look.ts         colours and frame for each state
//   faces.tsx       what's written on the button for each state
//   LevelMeter.tsx  the voice level bars
//   TalkTimer.tsx   how long the talk has lasted

// A finger that drifts while talking must not end the transmission.
const PRESS_RETENTION = { top: 400, bottom: 200, left: 200, right: 200 };

interface Props {
  state: PushToTalkState;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function PttButton({ state, onPressIn, onPressOut }: Props) {
  const look = lookFor(state);
  // With the mic blocked, holding does nothing: a tap opens Settings instead.
  const micOff = state.kind === 'micOff';
  return (
    <Pressable
      onPressIn={micOff ? undefined : onPressIn}
      onPressOut={micOff ? undefined : onPressOut}
      onPress={micOff ? () => Linking.openSettings() : undefined}
      pressRetentionOffset={PRESS_RETENTION}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(state)}
      accessibilityHint={micOff ? undefined : 'Hold to talk, release to stop'}
      style={[styles.button, { backgroundColor: look.background }, look.frame]}
    >
      <Face state={state} color={look.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 260,
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    borderRadius: Design.radius.phone,
    padding: Design.space.xlarge,
    justifyContent: 'space-between',
  },
});
