import { audioContext } from './context';

/** Short "you're live" blip, synthesised so no asset is needed. */
export function goLiveTone() {
  try {
    const ctx = audioContext();
    const startTime = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.13);
  } catch {
    // A missing tone must never block talking.
  }
}
