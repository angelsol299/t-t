import { Redirect } from 'expo-router';
import { useAppSelector } from '@/store';

/** First launch asks for a name; later launches land on the channel. */
export default function Index() {
  const name = useAppSelector((state) => state.session.name);
  return <Redirect href={name ? '/channel' : '/join'} />;
}
