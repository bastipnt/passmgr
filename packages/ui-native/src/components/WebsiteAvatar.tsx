import {
  AVATAR_FALLBACK,
  AVATAR_TILE,
  type AvatarTileSize,
  useWebsiteAvatar,
} from "@repo/ui-shared";
import { Image, Text, useColorScheme, View } from "react-native";

import { oklch } from "../lib/oklch";
import { cn } from "../lib/utils";

type Website = { value: string };

export type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
  size?: AvatarTileSize;
};

/** Favicon inset and initial per size, as web's `WebsiteAvatar`. */
const CONTENT = {
  default: { pad: 6, text: "font-semibold text-[16px]" },
  md: { pad: 8, text: "font-semibold text-[18px]" },
  lg: { pad: 10, text: "font-display text-[24px]" },
} as const satisfies Record<AvatarTileSize, unknown>;

/** Site favicon on a white rounded tile, or a hue-tinted initial. */
export function WebsiteAvatar({ title, websites, size = "default" }: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });
  const scheme = useColorScheme();
  const { box, radius } = AVATAR_TILE[size];
  const { pad, text } = CONTENT[size];
  const { bg, fg } = AVATAR_FALLBACK[scheme === "dark" ? "dark" : "light"];
  const showImage = status === "ok" && src;

  return (
    <View
      className="items-center justify-center overflow-hidden border border-foreground/8 dark:border-white/10"
      style={{
        width: box,
        height: box,
        borderRadius: radius,
        borderCurve: "continuous",
        padding: showImage ? pad : 0,
        backgroundColor: showImage ? "#ffffff" : oklch(bg.l, bg.c, hue),
      }}
    >
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: src }}
          className="h-full w-full rounded-[3px]"
        />
      ) : (
        <Text className={cn(text)} style={{ color: oklch(fg.l, fg.c, hue) }}>
          {title.charAt(0)}
        </Text>
      )}
    </View>
  );
}
