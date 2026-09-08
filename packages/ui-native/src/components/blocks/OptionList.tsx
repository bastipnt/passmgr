import { Check } from "lucide-react-native";
import { Fragment } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { cn } from "../../lib/utils";

export type Option<T> = { label: string; value: T };

type OptionListProps<T extends string | number> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/**
 * Single-select list with a check on the current option — the native stand-in
 * for web's `Select`. `MenuSelect` cannot fill this role: its trigger is an icon
 * button, so it has nowhere to show the setting's current value in a row.
 */
export function OptionList<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: OptionListProps<T>) {
  const primary = useCSSVariable("--color-primary") as string;

  return (
    <View className={cn("overflow-hidden rounded-md border border-border", className)}>
      {options.map((option, i) => {
        const selected = option.value === value;

        return (
          <Fragment key={option.value}>
            {i > 0 && <View className="h-px bg-border" />}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              className="flex-row items-center gap-md px-md py-sm"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text
                className={cn(
                  "flex-1 text-md",
                  selected ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {option.label}
              </Text>
              {selected && <Check size={18} color={primary} />}
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}
