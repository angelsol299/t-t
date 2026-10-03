import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChannelHeader } from '@/components/ChannelHeader';
import { FloorDeniedCard } from '@/components/FloorDeniedCard';
import { MessageList } from '@/components/MessageList';
import { PttButton } from '@/components/PttButton';
import { BackOnlineBand, OfflineBand, WeakBand } from '@/components/StatusBand';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME } from '@/config';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectPushToTalkState, selectSavedCount, selectSubtitle } from '@/store/selectors';
import { Design } from '@/theme/Design';

/**
 * 02–08: one screen; every state is driven by the store.
 * Each part below reads only the store values it shows, so a change (for
 * example the voice level, about 11 times a second) re-renders only that part.
 */
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

function ChannelTopBar() {
  const network = useAppSelector((state) => state.connection.net);
  const everConnected = useAppSelector((state) => state.connection.everConnected);
  // Until the first connection, show no status rather than a misleading "Online".
  const showStatus = everConnected || network === 'offline';
  return <TopBar net={showStatus ? network : undefined} onLongPressBrand={() => router.push('/join?edit=1')} />;
}

/** The weak / offline / back-online band under the header, if any. */
function ConnectionBand() {
  const network = useAppSelector((state) => state.connection.net);
  const offlineSince = useAppSelector((state) => state.connection.offlineSince);
  const nextRetryAt = useAppSelector((state) => state.connection.nextRetryAt);
  const missedOnReturn = useAppSelector((state) => state.connection.missedOnReturn);
  const saved = useAppSelector(selectSavedCount);

  if (network === 'weak') return <WeakBand />;
  if (network === 'offline' && offlineSince !== null) {
    return (
      <OfflineBand since={offlineSince} saved={saved} nextRetryAt={nextRetryAt} onRetry={() => registry.controller?.retryNow()} />
    );
  }
  if (network === 'recovering') {
    return <BackOnlineBand missed={missedOnReturn ?? 0} onReplay={() => registry.controller?.replayAll()} />;
  }
  return null;
}

/** 08: only while I'm still holding after losing a simultaneous-press race. */
function LostRaceCard() {
  const lostRaceTo = useAppSelector((state) => state.floor.lostRaceTo);
  const holding = useAppSelector((state) => state.floor.holding);
  return lostRaceTo && holding ? <FloorDeniedCard name={lostRaceTo.name} /> : null;
}

function PushToTalk() {
  const state = useAppSelector(selectPushToTalkState);
  return (
    <PttButton
      state={state}
      onPressIn={() => registry.controller?.pressIn()}
      onPressOut={() => registry.controller?.pressOut()}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Design.color.ground },
});
