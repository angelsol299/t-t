import { PushToTalkState } from '@/store/selectors';

export function accessibilityLabelFor(state: PushToTalkState): string {
  switch (state.kind) {
    case 'live':
      return "You're live";
    case 'local':
      return 'Recording';
    case 'receiving':
      return `${state.name} is talking`;
    case 'micOff':
      return 'Microphone off. Open settings to allow it';
    default:
      return 'Push to talk';
  }
}
