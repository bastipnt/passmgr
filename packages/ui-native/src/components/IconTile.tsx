import type { ReactNode } from "react";
import { useColorScheme, View } from "react-native";

import { oklch } from "../lib/oklch";

/** Tile edge and corner radius per size: `WebsiteAvatar`'s. */
const SIZES = {
  default: { box: 36, radius: 10 },
  md: { box: 42, radius: 12 },
  lg: { box: 56, radius: 16 },
} as const;

/** `WebsiteAvatar`'s fallback lightness/chroma per theme. */
const TONE = {
  light: { bg: [0.92, 0.06], fg: [0.35, 0.12] },
  dark: { bg: [0.28, 0.06], fg: [0.85, 0.1] },
} as const;

export type IconTileProps = {
  hue: number;
  /** Draws the icon in the given colour (the tile's foreground for `hue`). */
  icon: (color: string) => ReactNode;
  size?: keyof typeof SIZES;
};

/**
 * An icon on a hue-tinted tile, sized and coloured like `WebsiteAvatar`'s
 * initial fallback, so it sits in the same lists (record types).
 */
export function IconTile({ hue, icon, size = "default" }: IconTileProps) {
  const scheme = useColorScheme();
  const tone = TONE[scheme === "dark" ? "dark" : "light"];
  const { box, radius } = SIZES[size];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center border border-foreground/8 dark:border-white/10"
      style={{
        width: box,
        height: box,
        borderRadius: radius,
        borderCurve: "continuous",
        backgroundColor: oklch(tone.bg[0], tone.bg[1], hue),
      }}
    >
      {icon(oklch(tone.fg[0], tone.fg[1], hue))}
    </View>
  );
}
