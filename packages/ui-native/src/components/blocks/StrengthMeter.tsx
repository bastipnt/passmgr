import { LEVEL_COLOR } from "@repo/ui-shared";
import type { PasswordStrengthLevel } from "@repo/util";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

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
  const borderColor = useCSSVariable("--color-border") as string;

  return (
    <View className="mt-xs flex-row items-center gap-sm">
      <View className="flex-1 flex-row" style={{ gap: 5 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            className="h-[4px] flex-1 rounded-[2px]"
            style={{ backgroundColor: i <= filled ? color : borderColor }}
          />
        ))}
      </View>
      <Text className="font-semibold" style={{ fontSize: 12.5, color }}>
        {label}
      </Text>
    </View>
  );
}
