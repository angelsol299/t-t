import { StyleSheet } from 'react-native';

// Design tokens from the Teton Talk handoff. Values are final; match exactly.

export const colors = {
  ink: '#201e1d',
  ground: '#f8f4f4',
  surface: '#eae9e9',
  neutral200: '#eae7e7',
  neutral300: '#d7d3d3',
  neutral400: '#bab6b6',
  neutral700: '#605d5d',
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
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semiBold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  extraBold: 'Archivo_800ExtraBold',
} as const;

/** React Native letterSpacing is in px: em × font size. */
export const tracking = (ems: number, size: number) => ems * size;

export const type = StyleSheet.create({
  splash: { fontFamily: fonts.extraBold, fontSize: 56, letterSpacing: tracking(-0.045, 56), lineHeight: 56 * 0.95 },
  channel: { fontFamily: fonts.extraBold, fontSize: 48, letterSpacing: tracking(-0.045, 48), lineHeight: 48 },
  headline: { fontFamily: fonts.extraBold, fontSize: 40, letterSpacing: tracking(-0.04, 40), lineHeight: 40 },
  speaker: { fontFamily: fonts.extraBold, fontSize: 36, letterSpacing: tracking(-0.04, 36), lineHeight: 36 },
  input: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: tracking(-0.03, 30) },
  cta: { fontFamily: fonts.bold, fontSize: 20 },
  brand: { fontFamily: fonts.extraBold, fontSize: 16, letterSpacing: tracking(-0.03, 16) },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15 },
  body: { fontFamily: fonts.regular, fontSize: 15 },
  row: { fontFamily: fonts.regular, fontSize: 14 },
  rowStrong: { fontFamily: fonts.bold, fontSize: 14 },
  band: { fontFamily: fonts.semiBold, fontSize: 14 },
  meta: { fontFamily: fonts.regular, fontSize: 13 },
  pill: { fontFamily: fonts.semiBold, fontSize: 12, fontVariant: ['tabular-nums'] },
  caps: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: tracking(0.14, 11),
    textTransform: 'uppercase',
  },
});

export const radii = { phone: 30, card: 16, field: 24, pill: 99 } as const;

export const space = { gutter: 20, inset: 10, rowGap: 12 } as const;

export const MIN_TOUCH_TARGET = 44;
