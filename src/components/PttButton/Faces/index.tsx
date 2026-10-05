import type { PushToTalkState } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { HoldToTalkFace } from './HoldToTalkFace';
import { MicOffFace } from './MicOffFace';
import { ReceivingFace } from './ReceivingFace';
import { TalkingFace } from './TalkingFace';

// What is written on the button in each state (screens 02–08). `color` is the
// look's foreground (look.ts), so a face never decides its own colours.

export function Face({ state, color }: { state: PushToTalkState; color: string }) {
  switch (state.kind) {
    case 'idle':
    case 'pending':
      return (
        <HoldToTalkFace
          caption={state.kind === 'idle' && state.offline ? 'Sends when back online' : 'Push to talk'}
          color={color}
        />
      );
    // 03: I hold the floor and everyone hears me.
    case 'live':
      return (
        <TalkingFace
          title="On air"
          caption={`${state.listeners} hear you`}
          headline={'You’re\nlive'}
          startedAt={state.startedAt}
          level={state.level}
          color={color}
          warnColor={Design.color.weakText}
        />
      );
    // Weak or no signal: recording on the phone, sent when complete or back online. Deliberately not green.
    case 'local':
      return (
        <TalkingFace
          title="Recording"
          caption={state.offline ? 'Sends when back online' : 'Sends when complete'}
          captionColor={Design.color.neutral700}
          headline={'Saving\nmessage'}
          startedAt={state.startedAt}
          level={state.level}
          color={color}
          warnColor={Design.color.offline}
        />
      );
    case 'receiving':
      return <ReceivingFace name={state.name} startedAt={state.startedAt} level={state.level} color={color} />;
    case 'micOff':
      return <MicOffFace color={color} />;
  }
}
