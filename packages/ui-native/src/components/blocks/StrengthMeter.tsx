import { LEVEL_COLOR } from "@repo/ui-shared";
import type { PasswordStrengthLevel } from "@repo/util";
import { Text, View, XStack, type TextProps } from "tamagui";

type Color = TextProps["color"];

const LEVEL_INDEX: Record<PasswordStrengthLevel, number> = {
  weak: 1,
  fair: 2,
  strong: 3,
  "very-strong": 4,
};

export type StrengthMeterProps = {
  level: PasswordStrengthLevel;
  label: string;
};

/** Four-segment password strength meter filled up to the current level. */
export function StrengthMeter({ level, label }: StrengthMeterProps) {
  const filled = LEVEL_INDEX[level];
  const color = LEVEL_COLOR[level];

  return (
    <XStack items="center" gap="$sm" mt="$xs">
      <XStack flex={1} gap={5}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            flex={1}
            height={4}
            rounded={2}
            bg={(i <= filled ? color : "$border") as Color}
          />
        ))}
      </XStack>
      <Text fontSize={12.5} fontWeight="600" color={color as Color}>
        {label}
      </Text>
    </XStack>
  );
}
