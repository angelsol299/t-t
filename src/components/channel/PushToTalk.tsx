import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectPushToTalkState } from '@/store/selectors';
import { PttButton } from '../PttButton';

export const PushToTalk = () => {
  const state = useAppSelector(selectPushToTalkState);
  return (
    <PttButton
      state={state}
      onPressIn={() => registry.controller?.pressIn()}
      onPressOut={() => registry.controller?.pressOut()}
    />
  );
};
