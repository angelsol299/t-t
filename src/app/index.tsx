import { Redirect } from 'expo-router';
import { useAppSelector } from '@/store';
import { selectName } from '@/store/selectors';

/** First launch asks for a name; later launches land on the channel. */
export default function Index() {
  const name = useAppSelector(selectName);
  return <Redirect href={name ? '/channel' : '/join'} />;
}
