import { useAppSelector } from '@/store';
import { selectHolding, selectLostRaceTo } from '@/store/selectors';
import { FloorDeniedCard } from '../FloorDeniedCard';

export const LostRaceCard = () => {
  const lostRaceTo = useAppSelector(selectLostRaceTo);
  const holding = useAppSelector(selectHolding);
  return lostRaceTo && holding ? <FloorDeniedCard name={lostRaceTo.name} /> : null;
};
