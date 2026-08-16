import { Text, View } from "react-native";

import { cn } from "../../lib/utils";

export type WordmarkProps = {
  size?: number;
  /** Tailwind text-color class for the wordmark. */
  colorClassName?: string;
  /** Tailwind text-color class for the trailing accent dot. */
  dotClassName?: string;
};

/**
 * "Passmgr" wordmark with a trailing accent dot. Text-based (Inter) rather than
 * an SVG glyph, so it follows the app font setup.
 */
export function Wordmark({
  size = 40,
  colorClassName = "text-background",
  dotClassName = "text-muted-foreground",
}: WordmarkProps) {
  return (
    <View className="flex-row items-end" style={{ gap: size * 0.04 }}>
      <Text
        className={cn("font-bold", colorClassName)}
        style={{ fontSize: size, lineHeight: size, letterSpacing: -size * 0.02 }}
      >
        Passmgr
      </Text>
      <Text className={cn("font-bold", dotClassName)} style={{ fontSize: size, lineHeight: size }}>
        .
      </Text>
    </View>
  );
}
