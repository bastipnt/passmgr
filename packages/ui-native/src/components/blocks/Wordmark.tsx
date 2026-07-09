import { XStack, Text, ColorTokens } from "tamagui";

export type WordmarkProps = {
  size?: number;
  color?: ColorTokens;
  dot?: ColorTokens;
};

/**
 * "Passmgr" wordmark with a trailing accent dot. Text-based (Inter from the
 * tamagui config) rather than an SVG glyph, so it follows the app font setup.
 */
export function Wordmark({
  size = 40,
  color = "$background",
  dot = "$mutedForeground",
}: WordmarkProps) {
  return (
    <XStack items="flex-end" gap={size * 0.04}>
      <Text
        fontFamily="$body"
        fontSize={size}
        lineHeight={size}
        fontWeight="700"
        color={color}
        letterSpacing={-size * 0.02}
      >
        Passmgr
      </Text>
      <Text fontFamily="$body" fontSize={size} lineHeight={size} fontWeight="700" color={dot}>
        .
      </Text>
    </XStack>
  );
}
