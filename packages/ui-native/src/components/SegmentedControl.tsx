import { Host, Picker, Text as SwiftUIText } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Platform, Pressable, Text, View } from "react-native";
import { withUniwind } from "uniwind";

import { cn } from "../lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

const NativeHost = withUniwind(Host);

/**
 * Single-select segmented control. iOS renders the system one (a SwiftUI
 * `Picker` in `segmented` style); elsewhere an RN fallback styled like web's
 * `ToggleGroup`: a muted well with the selected segment lifted to a card.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  if (Platform.OS === "ios") {
    return (
      <NativeHost matchContents={{ vertical: true }} className={cn("w-full", className)}>
        <Picker
          selection={value}
          onSelectionChange={(selection) => onChange(selection as T)}
          modifiers={[pickerStyle("segmented")]}
        >
          {options.map((option) => (
            <SwiftUIText key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </SwiftUIText>
          ))}
        </Picker>
      </NativeHost>
    );
  }

  return (
    <View
      className={cn(
        "flex-row gap-1 rounded-xl border border-foreground/10 bg-muted/50 p-1 dark:border-white/10",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            className={cn(
              "h-8 flex-1 items-center justify-center rounded-lg border border-transparent",
              selected && "border-border bg-background",
            )}
          >
            <Text
              className={cn(
                "font-medium text-sm",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
