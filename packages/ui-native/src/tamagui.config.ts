import { createFont, createTamagui, createTokens } from "tamagui";
import { colors, fontSize, radius, spacing } from "@repo/tokens";

const space = {
  true: spacing.md,
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing.xxl,
} as const;

const size = {
  true: spacing.md,
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing.xxl,
} as const;

const radiusTokens = {
  true: radius.md,
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
} as const;

// const zIndexTokens = {
//   0: 0,
//   1: 100,
//   2: 200,
//   3: 300,
//   4: 400,
//   5: 500,
// } as const;

const zIndexTokens = {
  xs: 0,
  sm: 100,
  md: 200,
  lg: 300,
  xl: 400,
  xxl: 500,
} as const;

const colorTokens = {
  background: colors.light.background,
  foreground: colors.light.foreground,
  card: colors.light.card,
  cardForeground: colors.light.cardForeground,
  muted: colors.light.muted,
  mutedForeground: colors.light.mutedForeground,
  primary: colors.light.primary,
  primaryForeground: colors.light.primaryForeground,
  primaryPressed: colors.light.primaryPressed,
  secondary: colors.light.secondary,
  secondaryForeground: colors.light.secondaryForeground,
  accent: colors.light.accent,
  accentForeground: colors.light.accentForeground,
  destructive: colors.light.destructive,
  border: colors.light.border,
  input: colors.light.input,
  ring: colors.light.ring,
} as const;

const tokens = createTokens({
  color: colorTokens,
  space,
  size,
  radius: radiusTokens,
  zIndex: zIndexTokens,
});

type Palette = Record<keyof typeof colors.light, string>;

const themeFromPalette = (palette: Palette) => ({
  background: palette.background,
  foreground: palette.foreground,
  card: palette.card,
  cardForeground: palette.cardForeground,
  muted: palette.muted,
  mutedForeground: palette.mutedForeground,
  primary: palette.primary,
  primaryForeground: palette.primaryForeground,
  primaryPressed: palette.primaryPressed,
  secondary: palette.secondary,
  secondaryForeground: palette.secondaryForeground,
  accent: palette.accent,
  accentForeground: palette.accentForeground,
  destructive: palette.destructive,
  border: palette.border,
  input: palette.input,
  ring: palette.ring,
});

const themes = {
  light: themeFromPalette(colors.light),
  dark: themeFromPalette(colors.dark),
};

const body = createFont({
  family: "System",
  size: {
    true: fontSize.md,
    xs: fontSize.xs,
    sm: fontSize.sm,
    md: fontSize.md,
    lg: fontSize.lg,
    xl: fontSize.xl,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 26,
    xl: 30,
  },
  weight: {
    md: "400",
  },
});

export const tamaguiConfig = createTamagui({
  tokens,
  themes,
  fonts: {
    body,
    heading: body,
  },
  settings: {
    allowedStyleValues: "somewhat-strict",
  },
});

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
