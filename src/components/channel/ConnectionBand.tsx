import { registry } from '@/services/registry';
import { useAppSelector } from '@/store';
import { selectMissedOnReturn, selectNet, selectNextRetryAt, selectOfflineSince, selectSavedCount } from '@/store/selectors';
import { BackOnlineBand, OfflineBand, WeakBand } from '../StatusBand';

export const ConnectionBand = () => {
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
};
