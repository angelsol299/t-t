import { StyleSheet } from 'react-native';

// Design tokens from the Teton Talk handoff. Values are final; match exactly.

export const colors = {
  ink: '#201e1d',
  ground: '#f8f4f4',
  surface: '#eae9e9',
  n200: '#eae7e7',
  n300: '#d7d3d3',
  n400: '#bab6b6',
  n700: '#605d5d',
  white: '#ffffff',
  accent: '#ec3013',

  live: '#23d970',
  liveText: '#0b3d20',
  liveRing: 'rgba(35, 217, 112, 0.25)',
  liveHalo: 'rgba(35, 217, 112, 0.22)',

  weakDot: '#e0a100',
  weakBg: '#fff2cc',
  weakText: '#855b00',

  offline: '#b0271c',
  offlineBg: '#ffe1dd',

  backText: '#0f6b37',
  backBg: '#ddf7e7',

  talkText: '#173a7a',
  talkBg: '#dce7fb',
  talkSecondary: '#2a4d8f',
} as const;

export const fonts = {
  w400: 'Archivo_400Regular',
  w500: 'Archivo_500Medium',
  w600: 'Archivo_600SemiBold',
  w700: 'Archivo_700Bold',
  w800: 'Archivo_800ExtraBold',
} as const;

/** React Native letterSpacing is in px: em × font size. */
export const tracking = (em: number, size: number) => em * size;

export const type = StyleSheet.create({
  splash: { fontFamily: fonts.w800, fontSize: 56, letterSpacing: tracking(-0.045, 56), lineHeight: 56 * 0.95 },
  channel: { fontFamily: fonts.w800, fontSize: 48, letterSpacing: tracking(-0.045, 48), lineHeight: 48 },
  headline: { fontFamily: fonts.w800, fontSize: 40, letterSpacing: tracking(-0.04, 40), lineHeight: 40 },
  speaker: { fontFamily: fonts.w800, fontSize: 36, letterSpacing: tracking(-0.04, 36), lineHeight: 36 },
  input: { fontFamily: fonts.w700, fontSize: 30, letterSpacing: tracking(-0.03, 30) },
  cta: { fontFamily: fonts.w700, fontSize: 20 },
  brand: { fontFamily: fonts.w800, fontSize: 16, letterSpacing: tracking(-0.03, 16) },
  bodyStrong: { fontFamily: fonts.w700, fontSize: 15 },
  body: { fontFamily: fonts.w400, fontSize: 15 },
  row: { fontFamily: fonts.w400, fontSize: 14 },
  rowStrong: { fontFamily: fonts.w700, fontSize: 14 },
  band: { fontFamily: fonts.w600, fontSize: 14 },
  meta: { fontFamily: fonts.w400, fontSize: 13 },
  pill: { fontFamily: fonts.w600, fontSize: 12, fontVariant: ['tabular-nums'] },
  caps: {
    fontFamily: fonts.w600,
    fontSize: 11,
    letterSpacing: tracking(0.14, 11),
    textTransform: 'uppercase',
  },
});

export const radii = { phone: 30, card: 16, field: 24, pill: 99 } as const;

export const space = { gutter: 20, inset: 10, rowGap: 12 } as const;

export const HIT = 44;
