import { LEVEL_COLOR } from "@repo/ui-shared";
import type { PasswordStrengthLevel } from "@repo/util";
import { Text, View } from "react-native";

const LEVEL_INDEX: Record<PasswordStrengthLevel, number> = {
  weak: 1,
  fair: 2,
  strong: 3,
  "very-strong": 4,
};

export type StrengthMeterProps = {
  level: PasswordStrengthLevel;
  label: string;
  /** Muted text at the trailing edge, e.g. "16 characters". */
  detail?: string;
};

/** Web's four-segment strength meter: thin pills over a label row. */
export function StrengthMeter({ level, label, detail }: StrengthMeterProps) {
  const filled = LEVEL_INDEX[level];
  const color = LEVEL_COLOR[level];

  return (
    <View className="gap-1.5">
      <View className="flex-row gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            className="h-1 flex-1 rounded-full bg-foreground/10 dark:bg-white/10"
            style={i <= filled ? { backgroundColor: color } : undefined}
          />
        ))}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-xs" style={{ color }}>
          {label}
        </Text>
        {detail ? <Text className="text-muted-foreground text-xs">{detail}</Text> : null}
      </View>
    </View>
  );
}
