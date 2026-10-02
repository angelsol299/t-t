import { audioContext } from './context';

/** Short "you're live" blip, synthesised so no asset is needed. */
export function goLiveTone() {
  try {
    const context = audioContext();
    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.13);
  } catch {
    // A missing tone must never block talking.
  }
}
