import type { GeneratorMode } from "@repo/crypto";
import { cn } from "@repo/ui-native";
import { Pressable, Text, View } from "react-native";

const MODES: { value: GeneratorMode; label: string }[] = [
  { value: "password", label: "Password" },
  { value: "passphrase", label: "Passphrase" },
];

type GeneratorModeSwitchProps = {
  mode: GeneratorMode;
  setMode: (newMode: GeneratorMode) => void;
};

/** Segmented control shared by the generator sheet and the generator settings. */
export default function GeneratorModeSwitch({ mode, setMode }: GeneratorModeSwitchProps) {
  return (
    <View className="flex-row gap-xs rounded-lg border border-border bg-card p-xs">
      {MODES.map(({ value, label }) => {
        const selected = mode === value;

        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setMode(value)}
            className={cn(
              "h-[40px] flex-1 items-center justify-center rounded-md",
              selected && "bg-primary",
            )}
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
          >
            <Text
              className={cn(
                "font-semibold text-sm",
                selected ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
