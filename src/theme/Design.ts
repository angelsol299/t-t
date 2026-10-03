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

  export const fontFamily = {
    regular: 'Archivo_400Regular',
    medium: 'Archivo_500Medium',
    semiBold: 'Archivo_600SemiBold',
    bold: 'Archivo_700Bold',
    extraBold: 'Archivo_800ExtraBold',
  } as const;

  export const fontSize = {
    /** size: 56 */
    hero: 56,
    /** size: 48 */
    xxxlarge: 48,
    /** size: 40 */
    xxlarge: 40,
    /** size: 36 */
    xlarge: 36,
    /** size: 30 */
    large: 30,
    /** size: 20 */
    medium: 20,
    /** size: 16 */
    regular: 16,
    /** size: 15 */
    small: 15,
    /** size: 14 */
    xsmall: 14,
    /** size: 13 */
    xxsmall: 13,
    /** size: 12 */
    xxxsmall: 12,
    /** size: 11 */
    xxxxsmall: 11,
  } as const;

  /** React Native letterSpacing is in px: em × font size. */
  export const letterSpacing = (ems: number, fontSize: number) => ems * fontSize;

  export const typography = StyleSheet.create({
    /** size: 56 */
    splash: {
      fontFamily: fontFamily.extraBold,
      fontSize: fontSize.hero,
      letterSpacing: letterSpacing(-0.045, fontSize.hero),
      lineHeight: fontSize.hero * 0.95,
    },
    /** size: 48 */
    channel: {
      fontFamily: fontFamily.extraBold,
      fontSize: fontSize.xxxlarge,
      letterSpacing: letterSpacing(-0.045, fontSize.xxxlarge),
      lineHeight: fontSize.xxxlarge,
    },
    /** size: 40 */
    headline: {
      fontFamily: fontFamily.extraBold,
      fontSize: fontSize.xxlarge,
      letterSpacing: letterSpacing(-0.04, fontSize.xxlarge),
      lineHeight: fontSize.xxlarge,
    },
    /** size: 36 */
    speaker: {
      fontFamily: fontFamily.extraBold,
      fontSize: fontSize.xlarge,
      letterSpacing: letterSpacing(-0.04, fontSize.xlarge),
      lineHeight: fontSize.xlarge,
    },
    /** size: 30 */
    input: { fontFamily: fontFamily.bold, fontSize: fontSize.large, letterSpacing: letterSpacing(-0.03, fontSize.large) },
    /** size: 20 */
    cta: { fontFamily: fontFamily.bold, fontSize: fontSize.medium },
    /** size: 16 */
    brand: {
      fontFamily: fontFamily.extraBold,
      fontSize: fontSize.regular,
      letterSpacing: letterSpacing(-0.03, fontSize.regular),
    },
    /** size: 15 */
    bodyStrong: { fontFamily: fontFamily.bold, fontSize: fontSize.small },
    /** size: 15 */
    body: { fontFamily: fontFamily.regular, fontSize: fontSize.small },
    /** size: 14 */
    row: { fontFamily: fontFamily.regular, fontSize: fontSize.xsmall },
    /** size: 14 */
    rowStrong: { fontFamily: fontFamily.bold, fontSize: fontSize.xsmall },
    /** size: 14 */
    band: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xsmall },
    /** size: 13 */
    meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xxsmall },
    /** size: 12 */
    pill: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xxxsmall, fontVariant: ['tabular-nums'] },
    /** size: 11 */
    caps: {
      fontFamily: fontFamily.semiBold,
      fontSize: fontSize.xxxxsmall,
      letterSpacing: letterSpacing(0.14, fontSize.xxxxsmall),
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

  /**
   * Value to be used as padding, margin or gap in order to give space between elements.
   * A 4pt scale that keeps the handoff's key values: screen gutter = large, row gap = medium.
   *
   * @example
   * ```ts
   * viewStyle: {
   *   paddingHorizontal: Design.space.large,
   *   gap: Design.space.medium,
   * }
   * ```
   */
  export const space = {
    /** size: 40 */
    xxxlarge: 40,
    /** size: 24 */
    xlarge: 24,
    /** size: 20 (screen gutter) */
    large: 20,
    /** size: 16 */
    regular: 16,
    /** size: 12 (row gap) */
    medium: 12,
    /** size: 8 */
    small: 8,
    /** size: 4 */
    xsmall: 4,
    /** size: 2 */
    xxsmall: 2,
  } as const;

  export const layout = {
    /** Smallest tappable size (Apple HIG): 44 */
    minimumTouchTarget: 44,
  } as const;
}
