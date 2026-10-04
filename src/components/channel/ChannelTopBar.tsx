import { useAppSelector } from '@/store';
import { selectTopBarNet } from '@/store/selectors';
import { router } from 'expo-router';
import { TopBar } from '../TopBar';

export const ChannelTopBar = () => {
  const network = useAppSelector(selectTopBarNet);
  return <TopBar net={network} onLongPressBrand={() => router.push('/join?edit=1')} />;
};
