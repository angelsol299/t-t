import { ChannelHeader } from '@/components/ChannelHeader';
import { FloorDeniedCard } from '@/components/FloorDeniedCard';
import { MessageList } from '@/components/MessageList';
import { PttButton } from '@/components/PttButton';
import { BackOnlineBand, OfflineBand, WeakBand } from '@/components/StatusBand';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME } from '@/config';
import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import {
  selectHolding,
  selectLostRaceTo,
  selectMissedOnReturn,
  selectNet,
  selectNextRetryAt,
  selectOfflineSince,
  selectPushToTalkState,
  selectSavedCount,
  selectSubtitle,
  selectTopBarNet,
} from '@/store/selectors';
import { Design } from '@/theme/Design';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const network = useAppSelector(selectTopBarNet);
  return <TopBar net={network} onLongPressBrand={() => router.push('/join?edit=1')} />;
}

/** The weak / offline / back-online band under the header, if any. */
function ConnectionBand() {
  const network = useAppSelector(selectNet);
  const offlineSince = useAppSelector(selectOfflineSince);
  const nextRetryAt = useAppSelector(selectNextRetryAt);
  const missedOnReturn = useAppSelector(selectMissedOnReturn);
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
  const lostRaceTo = useAppSelector(selectLostRaceTo);
  const holding = useAppSelector(selectHolding);
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
