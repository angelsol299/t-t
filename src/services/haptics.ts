import * as Haptics from 'expo-haptics';

const DOUBLE_BUZZ_GAP_MS = 140;

/** One strong buzz: the mic opened, or the 60-second limit stopped the recording. */
export function buzz() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Two quick buzzes: someone else got the floor first. */
export function doubleBuzz() {
  buzz();
  setTimeout(buzz, DOUBLE_BUZZ_GAP_MS);
}
