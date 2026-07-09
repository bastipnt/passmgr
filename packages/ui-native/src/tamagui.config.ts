import { createFont, createTamagui, createTokens, isWeb } from "tamagui";
import {
  createV5Theme,
  defaultChildrenThemes,
  defaultConfig,
  v5ComponentThemes,
} from "@tamagui/config/v5";
import { yellow, yellowDark, red, redDark, green, greenDark } from "@tamagui/colors";
import { colors, fontSize, radius, spacing } from "@repo/ui-shared";
import { sizeToSpace } from "./utils";

const sizeTokens = {
  true: spacing.md,
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing.xxl,
} as const;

type SizeKeysIn = keyof typeof sizeTokens;
type Sizes = {
  [Key in SizeKeysIn extends `$${infer Key}` ? Key : SizeKeysIn]: number;
};
type SizeKeys = `${keyof Sizes extends `${infer K}` ? K : never}`;

const mySpaceTokens: {
  [Key in SizeKeys]: Key extends keyof Sizes ? Sizes[Key] : number;
} = Object.fromEntries(
  Object.entries(sizeTokens).map(([k, v]) => {
    return [k, sizeToSpace(v)] as const;
  }),
) as any;

const spaceTokens = {
  ...defaultConfig.tokens.space,
  ...mySpaceTokens,
} as const;

const radiusTokens = {
  true: radius.md,
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
} as const;

const zIndexTokens = {
  xs: 0,
  sm: 100,
  md: 200,
  lg: 300,
  xl: 400,
  xxl: 500,
} as const;

const colorTokens = {
  color: colors.light.foreground,
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
  space: spaceTokens,
  size: sizeTokens,
  radius: radiusTokens,
  zIndex: zIndexTokens,
});

const builtThemes = createV5Theme({
  darkPalette: colors.darkPalette,
  lightPalette: colors.lightPalette,
  componentThemes: v5ComponentThemes,
  accent: {
    light: colors.accentLight,
    dark: colors.accentDark,
  },
  childrenThemes: {
    // Include default color themes (blue, red, green, yellow, etc.)
    ...defaultChildrenThemes,

    // Semantic color themes for warnings, errors, and success states
    warning: {
      light: yellow,
      dark: yellowDark,
    },
    error: {
      light: { ...red, destructive: red.red10 },
      dark: { ...redDark, destructive: redDark.red10 },
    },
    success: {
      light: green,
      dark: greenDark,
    },
  },
});

const LINE_HEIGHT_RATIO = 1.618 as const;

const defaultFont = createFont({
  family: isWeb ? "Inter, Helvetica, Arial, sans-serif" : "Inter",
  size: {
    true: fontSize.md,
    xs: fontSize.xs,
    sm: fontSize.sm,
    md: fontSize.md,
    lg: fontSize.lg,
    xl: fontSize.xl,
    xxl: fontSize.xxl,
  },
  lineHeight: {
    true: fontSize.md * LINE_HEIGHT_RATIO,
    xs: fontSize.xs * LINE_HEIGHT_RATIO,
    sm: fontSize.sm * LINE_HEIGHT_RATIO,
    md: fontSize.md * LINE_HEIGHT_RATIO,
    lg: fontSize.lg * LINE_HEIGHT_RATIO,
    xl: fontSize.xl * LINE_HEIGHT_RATIO,
    xxl: fontSize.xxl * LINE_HEIGHT_RATIO,
  },
  weight: {
    true: "400",
    default: "400",
    bold: "600",
  },
});

export type Themes = typeof builtThemes;

// the process.env conditional here is optional but saves web client-side bundle
// size by leaving out themes JS. tamagui automatically hydrates themes from CSS
// back into JS for you, and the bundler plugins set TAMAGUI_ENVIRONMENT. so
// long as you are using the Vite, Next, Webpack plugins this should just work,
// but if not you can just export builtThemes directly as themes:
const themes: Themes =
  process.env.TAMAGUI_ENVIRONMENT === "client" && process.env.NODE_ENV === "production"
    ? ({} as any)
    : (builtThemes as any);

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes,
  tokens: {
    ...defaultConfig.tokens,
    ...tokens,
  },
  fonts: {
    ...defaultConfig.fonts,
    body: defaultFont,
    heading: defaultFont,
  },
});

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
