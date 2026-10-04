import { ChannelHeader } from '@/components/channel/ChannelHeader';
import { ChannelTopBar } from '@/components/channel/ChannelTopBar';
import { ConnectionBand } from '@/components/channel/ConnectionBand';
import { LostRaceCard } from '@/components/channel/LostRaceCard';
import { MessageList } from '@/components/channel/MessageList';
import { PushToTalk } from '@/components/channel/PushToTalk';
import { CHANNEL_NAME } from '@/config';
import { Design } from '@/theme/Design';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Channel() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ChannelTopBar />
      <ChannelHeader name={CHANNEL_NAME} />
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
