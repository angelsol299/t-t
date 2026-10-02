import { StyleSheet } from 'react-native';

/**
 * Design tokens from the Teton Talk handoff. Values are final; match exactly.
 *
 * @example
 * ```ts
 * viewStyle: {
 *   backgroundColor: Design.color.ground,
 *   borderRadius: Design.radius.card,
 * }
 * ```
 */
export namespace Design {
  export const color = {
    ink: '#201e1d',
    ground: '#f8f4f4',
    surface: '#eae9e9',
    neutral200: '#eae7e7',
    neutral300: '#d7d3d3',
    neutral400: '#bab6b6',
    neutral700: '#605d5d',
    white: '#ffffff',
    accent: '#ec3013',
    // Live: someone is talking right now
    live: '#23d970',
    liveText: '#0b3d20',
    liveRing: 'rgba(35, 217, 112, 0.25)',
    liveHalo: 'rgba(35, 217, 112, 0.22)',
    // Weak signal band
    weakDot: '#e0a100',
    weakBg: '#fff2cc',
    weakText: '#855b00',
    // Offline band
    offline: '#b0271c',
    offlineBg: '#ffe1dd',
    // "Back online" band
    backText: '#0f6b37',
    backBg: '#ddf7e7',
    // Receiving someone else's talk
    talkText: '#173a7a',
    talkBg: '#dce7fb',
    talkSecondary: '#2a4d8f',
  } as const;
  export type ColorName = keyof typeof color;
  export type ColorValue = (typeof color)[ColorName];

  export const fontFamily = {
    regular: 'Archivo_400Regular',
    medium: 'Archivo_500Medium',
    semiBold: 'Archivo_600SemiBold',
    bold: 'Archivo_700Bold',
    extraBold: 'Archivo_800ExtraBold',
  } as const;

  /** React Native letterSpacing is in px: em × font size. */
  export const letterSpacing = (ems: number, fontSize: number) => ems * fontSize;

  export const typography = StyleSheet.create({
    /** size: 56 */
    splash: { fontFamily: fontFamily.extraBold, fontSize: 56, letterSpacing: letterSpacing(-0.045, 56), lineHeight: 56 * 0.95 },
    /** size: 48 */
    channel: { fontFamily: fontFamily.extraBold, fontSize: 48, letterSpacing: letterSpacing(-0.045, 48), lineHeight: 48 },
    /** size: 40 */
    headline: { fontFamily: fontFamily.extraBold, fontSize: 40, letterSpacing: letterSpacing(-0.04, 40), lineHeight: 40 },
    /** size: 36 */
    speaker: { fontFamily: fontFamily.extraBold, fontSize: 36, letterSpacing: letterSpacing(-0.04, 36), lineHeight: 36 },
    /** size: 30 */
    input: { fontFamily: fontFamily.bold, fontSize: 30, letterSpacing: letterSpacing(-0.03, 30) },
    /** size: 20 */
    cta: { fontFamily: fontFamily.bold, fontSize: 20 },
    /** size: 16 */
    brand: { fontFamily: fontFamily.extraBold, fontSize: 16, letterSpacing: letterSpacing(-0.03, 16) },
    /** size: 15 */
    bodyStrong: { fontFamily: fontFamily.bold, fontSize: 15 },
    /** size: 15 */
    body: { fontFamily: fontFamily.regular, fontSize: 15 },
    /** size: 14 */
    row: { fontFamily: fontFamily.regular, fontSize: 14 },
    /** size: 14 */
    rowStrong: { fontFamily: fontFamily.bold, fontSize: 14 },
    /** size: 14 */
    band: { fontFamily: fontFamily.semiBold, fontSize: 14 },
    /** size: 13 */
    meta: { fontFamily: fontFamily.regular, fontSize: 13 },
    /** size: 12 */
    pill: { fontFamily: fontFamily.semiBold, fontSize: 12, fontVariant: ['tabular-nums'] },
    /** size: 11 */
    caps: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: letterSpacing(0.14, 11),
      textTransform: 'uppercase',
    },
  });

  export const radius = {
    /** size: 30 */
    phone: 30,
    /** size: 16 */
    card: 16,
    /** size: 24 */
    field: 24,
    /** size: 99 (fully rounded) */
    pill: 99,
  } as const;

  /** Value to be used as padding, margin or gap in order to give space between elements. */
  export const space = {
    /** size: 20 */
    gutter: 20,
    /** size: 12 */
    rowGap: 12,
    /** size: 10 */
    inset: 10,
  } as const;

  export const layout = {
    /** Smallest tappable size (Apple HIG): 44 */
    minimumTouchTarget: 44,
  } as const;
}
