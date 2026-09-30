import { useWebsiteAvatar } from "@repo/ui-shared";
import { Image, Text, useColorScheme, View } from "react-native";

import { oklch } from "../lib/oklch";
import { cn } from "../lib/utils";

type Website = { value: string };

export type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
  size?: "default" | "md" | "lg";
};

/** Tile edge, corner radius and favicon inset per size — web's `WebsiteAvatar`. */
const SIZES = {
  default: { box: 36, radius: 10, pad: 6, text: "font-semibold text-[16px]" },
  md: { box: 42, radius: 12, pad: 8, text: "font-semibold text-[18px]" },
  lg: { box: 56, radius: 16, pad: 10, text: "font-display text-[24px]" },
} as const;

/** Web's `--avatar-fallback-*` lightness/chroma per theme. */
const FALLBACK = {
  light: { bg: [0.92, 0.06], fg: [0.35, 0.12] },
  dark: { bg: [0.28, 0.06], fg: [0.85, 0.1] },
} as const;

/** Site favicon on a white rounded tile, or a hue-tinted initial. */
export function WebsiteAvatar({ title, websites, size = "default" }: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });
  const scheme = useColorScheme();
  const { box, radius, pad, text } = SIZES[size];
  const tone = FALLBACK[scheme === "dark" ? "dark" : "light"];
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
        backgroundColor: showImage ? "#ffffff" : oklch(tone.bg[0], tone.bg[1], hue),
      }}
    >
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: src }}
          className="h-full w-full rounded-[3px]"
        />
      ) : (
        <Text className={cn(text)} style={{ color: oklch(tone.fg[0], tone.fg[1], hue) }}>
          {title.charAt(0)}
        </Text>
      )}
    </View>
  );
}
