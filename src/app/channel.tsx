import { ChannelTopBar } from '@/components/channel/ChannelTopBar';
import { ConnectionBand } from '@/components/channel/ConnectionBand';
import { LostRaceCard } from '@/components/channel/LostRaceCard';
import { PushToTalk } from '@/components/channel/PushToTalk';
import { ChannelHeader } from '@/components/ChannelHeader';
import { MessageList } from '@/components/MessageList';
import { CHANNEL_NAME } from '@/config';
import { useAppSelector } from '@/store';
import { selectSubtitle } from '@/store/selectors';
import { Design } from '@/theme/Design';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Channel() {
  const subtitle = useAppSelector(selectSubtitle);
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ChannelTopBar />
      <ChannelHeader name={CHANNEL_NAME} subtitle={subtitle} />
      <ConnectionBand />
      <MessageList />
      <LostRaceCard />
      <PushToTalk />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Design.color.ground },
});
