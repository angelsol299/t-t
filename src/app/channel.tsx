import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChannelHeader } from '@/components/ChannelHeader';
import { FloorDeniedCard } from '@/components/FloorDeniedCard';
import { MessageList } from '@/components/MessageList';
import { PttButton, type PttState } from '@/components/PttButton';
import { BackOnlineBand, OfflineBand, WeakBand } from '@/components/StatusBand';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME } from '@/config';
import { useController } from '@/hooks/useController';
import { useAppSelector } from '@/store';
import { useGetMessagesQuery } from '@/store/api/channelApi';
import { selectSavedCount } from '@/store/selectors';
import { colors } from '@/theme/tokens';

/** 02–08: one screen; every state is driven by the store. */
export default function Channel() {
  useGetMessagesQuery();
  const controller = useController();
  const connection = useAppSelector((state) => state.connection);
  const floor = useAppSelector((state) => state.floor);
  const offset = useAppSelector((state) => state.session.serverOffset);
  const saved = useAppSelector(selectSavedCount);

  const offline = connection.net === 'offline';
  const listeners = Math.max(0, connection.online - 1);

  let subtitle = connection.everConnected ? `${connection.online} online` : 'Connecting…';
  if (floor.my?.mode === 'live') subtitle = `Live to ${listeners}`;
  if (offline) subtitle = `${connection.onlineAtDrop ?? connection.online} online when you lost signal`;
  if (floor.notice) subtitle = floor.notice;

  let ptt: PttState;
  if (floor.micDenied) ptt = { kind: 'micOff' };
  else if (floor.my?.mode === 'live')
    ptt = { kind: 'live', startedAt: floor.my.startedAt, listeners, level: floor.level };
  else if (floor.my?.mode === 'local')
    ptt = { kind: 'local', startedAt: floor.my.startedAt, level: floor.level, offline };
  else if (floor.my?.mode === 'pending') ptt = { kind: 'pending' };
  else if (floor.speaker)
    ptt = {
      kind: 'receiving',
      name: floor.speaker.name,
      startedAt: floor.speaker.startedAt - offset,
      level: floor.level,
    };
  else ptt = { kind: 'idle', offline };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <TopBar net={connection.everConnected || offline ? connection.net : undefined} onLongPressBrand={() => router.push('/join?edit=1')} />
      <ChannelHeader name={CHANNEL_NAME} sub={subtitle} />
      {connection.net === 'weak' && <WeakBand />}
      {offline && connection.offlineSince !== null && (
        <OfflineBand
          since={connection.offlineSince}
          saved={saved}
          nextRetryAt={connection.nextRetryAt}
          onRetry={() => controller.retryNow()}
        />
      )}
      {connection.net === 'recovering' && (
        <BackOnlineBand missed={connection.missedOnReturn ?? 0} onReplay={() => controller.replayAll()} />
      )}
      <MessageList />
      {floor.denied && floor.holding && <FloorDeniedCard name={floor.denied.name} />}
      <PttButton state={ptt} onPressIn={() => controller.pressIn()} onPressOut={() => controller.pressOut()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
});
