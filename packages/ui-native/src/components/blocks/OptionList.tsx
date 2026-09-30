import { Check } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { useCSSVariable } from "uniwind";

import { cn } from "../../lib/utils";
import { SectionGroup } from "./Section";

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
    <SectionGroup className={className}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className="h-12 flex-row items-center gap-4 px-5 active:bg-foreground/5"
          >
            <Text
              className={cn(
                "flex-1 text-[16px]",
                selected ? "font-semibold text-foreground" : "text-foreground",
              )}
            >
              {option.label}
            </Text>
            {selected && <Check size={18} color={primary} />}
          </Pressable>
        );
      })}
    </SectionGroup>
  );
}
