import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

const PULSE_MS = 1800;

export function usePulse() {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    async function startPulse() {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (reduceMotion || cancelled) return; // `cancelled`: unmounted while reading the setting
      loop = Animated.loop(
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      );
      loop.start();
    }
    // An effect can't await, so the pulse starts on its own; cleanup stops it either way.
    void startPulse();

    return () => {
      cancelled = true;
      loop?.stop();
      pulse.setValue(0);
    };
  }, [pulse]);

  return pulse;
}
