import { createV5Theme, defaultChildrenThemes } from "@tamagui/config/v5";
import { v5ComponentThemes } from "@tamagui/themes/v5";
import { yellow, yellowDark, red, redDark, green, greenDark } from "@tamagui/colors";
// import { fontSize } from "@repo/tokens";
// import { createFont } from "tamagui";

const darkPalette = [
  "hsla(310, 12%, 1%, 1)",
  "hsla(310, 12%, 6%, 1)",
  "hsla(310, 12%, 12%, 1)",
  "hsla(310, 12%, 17%, 1)",
  "hsla(310, 12%, 23%, 1)",
  "hsla(310, 12%, 28%, 1)",
  "hsla(310, 12%, 34%, 1)",
  "hsla(310, 12%, 39%, 1)",
  "hsla(310, 12%, 45%, 1)",
  "hsla(310, 12%, 50%, 1)",
  "hsla(0, 15%, 93%, 1)",
  "hsla(0, 15%, 99%, 1)",
];
const lightPalette = [
  "hsla(310, 12%, 96%, 1)",
  "hsla(310, 12%, 91%, 1)",
  "hsla(310, 12%, 86%, 1)",
  "hsla(310, 12%, 81%, 1)",
  "hsla(310, 12%, 76%, 1)",
  "hsla(310, 12%, 70%, 1)",
  "hsla(310, 12%, 65%, 1)",
  "hsla(310, 12%, 60%, 1)",
  "hsla(310, 12%, 55%, 1)",
  "hsla(310, 12%, 50%, 1)",
  "hsla(0, 15%, 15%, 1)",
  "hsla(0, 15%, 1%, 1)",
];

// Your custom accent color theme
const accentLight = {
  accent1: "hsla(20, 42%, 45%, 1)",
  accent2: "hsla(20, 42%, 47%, 1)",
  accent3: "hsla(20, 42%, 49%, 1)",
  accent4: "hsla(20, 42%, 52%, 1)",
  accent5: "hsla(20, 42%, 54%, 1)",
  accent6: "hsla(20, 42%, 56%, 1)",
  accent7: "hsla(20, 42%, 58%, 1)",
  accent8: "hsla(20, 42%, 61%, 1)",
  accent9: "hsla(20, 42%, 63%, 1)",
  accent10: "hsla(20, 42%, 65%, 1)",
  accent11: "hsla(250, 50%, 95%, 1)",
  accent12: "hsla(250, 50%, 95%, 1)",
};

const accentDark = {
  accent1: "hsla(20, 42%, 35%, 1)",
  accent2: "hsla(20, 42%, 38%, 1)",
  accent3: "hsla(20, 42%, 41%, 1)",
  accent4: "hsla(20, 42%, 43%, 1)",
  accent5: "hsla(20, 42%, 46%, 1)",
  accent6: "hsla(20, 42%, 49%, 1)",
  accent7: "hsla(20, 42%, 52%, 1)",
  accent8: "hsla(20, 42%, 54%, 1)",
  accent9: "hsla(20, 42%, 57%, 1)",
  accent10: "hsla(20, 42%, 60%, 1)",
  accent11: "hsla(250, 50%, 90%, 1)",
  accent12: "hsla(250, 50%, 95%, 1)",
};

const builtThemes = createV5Theme({
  darkPalette,
  lightPalette,
  componentThemes: v5ComponentThemes,
  accent: {
    light: accentLight,
    dark: accentDark,
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

export type Themes = typeof builtThemes;

// the process.env conditional here is optional but saves web client-side bundle
// size by leaving out themes JS. tamagui automatically hydrates themes from CSS
// back into JS for you, and the bundler plugins set TAMAGUI_ENVIRONMENT. so
// long as you are using the Vite, Next, Webpack plugins this should just work,
// but if not you can just export builtThemes directly as themes:
export const themes: Themes =
  process.env.TAMAGUI_ENVIRONMENT === "client" && process.env.NODE_ENV === "production"
    ? ({} as any)
    : (builtThemes as any);

// export const space = {
//   true: spacing.md,
//   xs: spacing.xs,
//   sm: spacing.sm,
//   md: spacing.md,
//   lg: spacing.lg,
//   xl: spacing.xl,
//   xxl: spacing.xxl,
// } as const;

// export const bodyFont = createFont({
//   family: "System",
//   size: {
//     true: fontSize.md,
//     xs: fontSize.xs,
//     sm: fontSize.sm,
//     md: fontSize.md,
//     lg: fontSize.lg,
//     xl: fontSize.xl,
//   },
//   lineHeight: {
//     xs: 16,
//     sm: 20,
//     md: 24,
//     lg: 26,
//     xl: 30,
//   },
//   weight: {
//     md: "400",
//   },
// });
