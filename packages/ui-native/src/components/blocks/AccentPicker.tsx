import {
  ACCENT_COLORS,
  ACCENT_LABELS,
  ACCENT_PRESETS,
  type AccentPreset,
  type ColorMode,
  DEFAULT_ACCENT,
} from "@repo/ui-shared";
import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { cn } from "../../lib/utils";
import { Badge } from "../Badge";
import { BrandMark } from "./BrandMark";

/** Explicit colors, not tokens: each half shows its preset and mode, whatever the app is in. */
function AccentPreview({ accent, mode }: { accent: AccentPreset; mode: ColorMode }) {
  const c = ACCENT_COLORS[accent][mode];

  return (
    <View className="flex-1 gap-1.5 p-2" style={{ backgroundColor: c.background }}>
      <View className="flex-row items-center gap-1.5">
        <BrandMark size={16} colors={{ tile: c.primary, glyph: c["primary-foreground"] }} />
        <View
          className="h-1.5 w-8 rounded-full opacity-40"
          style={{ backgroundColor: c["muted-foreground"] }}
        />
      </View>
      <View className="h-3 justify-center overflow-hidden rounded-sm px-1">
        <View className="absolute inset-0 opacity-15" style={{ backgroundColor: c.primary }} />
        <View className="h-1 w-6 rounded-full" style={{ backgroundColor: c["primary-text"] }} />
      </View>
      <View className="h-3 w-10 rounded-full" style={{ backgroundColor: c.primary }} />
    </View>
  );
}

type AccentPickerProps = {
  value: AccentPreset;
  onChange: (value: AccentPreset) => void;
  className?: string;
};

/** Accent preset cards in two columns, each previewing light and dark — web's `AccentPicker`. */
export function AccentPicker({ value, onChange, className }: AccentPickerProps) {
  const onPrimary = useCSSVariable("--color-primary-foreground") as string;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Accent"
      className={cn("flex-row flex-wrap gap-2", className)}
    >
      {ACCENT_PRESETS.map((preset) => {
        const selected = preset === value;

        return (
          <Pressable
            key={preset}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={ACCENT_LABELS[preset]}
            onPress={() => onChange(preset)}
            className={cn(
              "grow basis-[48%] gap-2 rounded-xl border-2 bg-card p-1.5 active:opacity-80",
              selected ? "border-primary" : "border-border",
            )}
          >
            <View className="flex-row overflow-hidden rounded-lg border border-border">
              <AccentPreview accent={preset} mode="light" />
              <AccentPreview accent={preset} mode="dark" />
            </View>
            <View className="flex-row items-center gap-1.5 px-1 pb-0.5">
              <Text className="font-medium text-foreground text-sm">{ACCENT_LABELS[preset]}</Text>
              {preset === DEFAULT_ACCENT && <Badge variant="outline">Default</Badge>}
              <View
                className={cn(
                  "ml-auto size-4 items-center justify-center rounded-full",
                  selected ? "bg-primary" : "border border-input",
                )}
              >
                {selected && <Check size={12} strokeWidth={3} color={onPrimary} />}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
