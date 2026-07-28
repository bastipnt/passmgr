import { Platform, Pressable, Text, View } from "react-native";
import { Host, Slider as SwiftUISlider } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import { MinusIcon, PlusIcon } from "lucide-react-native";
import { useCSSVariable, withUniwind } from "uniwind";

import { cn } from "../lib/utils";

const NativeHost = withUniwind(Host);

export type SliderProps = {
  value: number;
  min: number;
  max: number;
  /** Increment the value snaps to. Defaults to 1 (integer values). */
  step?: number;
  onValueChange: (value: number) => void;
  accessibilityLabel?: string;
  className?: string;
};

/**
 * iOS renders the SwiftUI slider; every other platform falls back to a −/+
 * stepper, since RN core has no slider of its own.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  accessibilityLabel,
  className,
}: SliderProps) {
  const primary = useCSSVariable("--color-primary") as string;
  const foreground = useCSSVariable("--color-foreground") as string;

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  if (Platform.OS === "ios") {
    return (
      <NativeHost className={cn("h-[36px]", className)}>
        <SwiftUISlider
          value={value}
          min={min}
          max={max}
          step={step}
          // The bridged value is a float even when stepped, so snap it back onto
          // the step grid before it reaches form state.
          onValueChange={(next) => onValueChange(clamp(Math.round(next / step) * step))}
          modifiers={[tint(primary)]}
        />
      </NativeHost>
    );
  }

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      className={cn("flex-row items-center gap-md", className)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        hitSlop={8}
        className="h-[36px] w-[36px] items-center justify-center rounded-lg border border-border"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        onPress={() => onValueChange(clamp(value - step))}
      >
        <MinusIcon size={18} color={foreground} />
      </Pressable>

      <View className="h-[4px] flex-1 overflow-hidden rounded-full bg-border">
        <View
          className="h-full bg-primary"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        hitSlop={8}
        className="h-[36px] w-[36px] items-center justify-center rounded-lg border border-border"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        onPress={() => onValueChange(clamp(value + step))}
      >
        <PlusIcon size={18} color={foreground} />
      </Pressable>

      <Text className="w-[32px] text-right text-sm text-muted-foreground">{value}</Text>
    </View>
  );
}
