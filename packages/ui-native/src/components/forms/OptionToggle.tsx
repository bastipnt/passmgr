import { Switch, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { cn } from "../../lib/utils";

export type OptionToggleProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
};

/** Label + platform switch on one row — the native counterpart of web's `Field` + `Switch`. */
export function OptionToggle({ label, checked, onChange, className }: OptionToggleProps) {
  const primary = useCSSVariable("--color-primary") as string;
  const border = useCSSVariable("--color-border") as string;

  return (
    <View className={cn("flex-row items-center justify-between gap-md", className)}>
      <Text className="flex-1 text-foreground text-md">{label}</Text>
      <Switch
        value={checked}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: primary, false: border }}
      />
    </View>
  );
}
