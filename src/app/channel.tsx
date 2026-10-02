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
  const c = useController();
  const conn = useAppSelector((s) => s.connection);
  const floor = useAppSelector((s) => s.floor);
  const offset = useAppSelector((s) => s.session.serverOffset);
  const saved = useAppSelector(selectSavedCount);

  const offline = conn.net === 'offline';
  const listeners = Math.max(0, conn.online - 1);

  let sub = conn.everConnected ? `${conn.online} online` : 'Connecting…';
  if (floor.my?.mode === 'live') sub = `Live to ${listeners}`;
  if (offline) sub = `${conn.onlineAtDrop ?? conn.online} online when you lost signal`;
  if (floor.notice) sub = floor.notice;

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
      <TopBar net={conn.everConnected || offline ? conn.net : undefined} onLongPressBrand={() => router.push('/join?edit=1')} />
      <ChannelHeader name={CHANNEL_NAME} sub={sub} />
      {conn.net === 'weak' && <WeakBand />}
      {offline && conn.offlineSince !== null && (
        <OfflineBand
          since={conn.offlineSince}
          saved={saved}
          nextRetryAt={conn.nextRetryAt}
          onRetry={() => c.retryNow()}
        />
      )}
      {conn.net === 'recovering' && (
        <BackOnlineBand missed={conn.missedOnReturn ?? 0} onReplay={() => c.replayAll()} />
      )}
      <MessageList />
      {floor.denied && floor.holding && <FloorDeniedCard name={floor.denied.name} />}
      <PttButton state={ptt} onPressIn={() => c.pressIn()} onPressOut={() => c.pressOut()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
});
