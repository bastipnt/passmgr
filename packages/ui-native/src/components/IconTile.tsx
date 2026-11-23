import { AVATAR_FALLBACK, AVATAR_TILE, type AvatarTileSize } from "@repo/ui-shared";
import type { ReactNode } from "react";
import { useColorScheme, View } from "react-native";

import { oklch } from "../lib/oklch";

export type IconTileProps = {
  hue: number;
  /** Draws the icon in the given colour (the tile's foreground for `hue`). */
  icon: (color: string) => ReactNode;
  size?: AvatarTileSize;
};

/**
 * An icon on a hue-tinted tile, sized and coloured like `WebsiteAvatar`'s
 * initial fallback, so it sits in the same lists (record types).
 */
export function IconTile({ hue, icon, size = "default" }: IconTileProps) {
  const scheme = useColorScheme();
  const { bg, fg } = AVATAR_FALLBACK[scheme === "dark" ? "dark" : "light"];
  const { box, radius } = AVATAR_TILE[size];

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
        backgroundColor: oklch(bg.l, bg.c, hue),
      }}
    >
      {icon(oklch(fg.l, fg.c, hue))}
    </View>
  );
}
