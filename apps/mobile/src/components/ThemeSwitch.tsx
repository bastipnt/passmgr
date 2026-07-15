import { Pressable, Text, View } from "react-native";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { cn } from "@repo/ui-native";
import {
  THEME_LABELS,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/use-theme-preference";

const OPTIONS: { value: ThemePreference; Icon: LucideIcon }[] = [
  { value: "system", Icon: Monitor },
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
];

export function ThemeSwitch() {
  const { preference, setPreference } = useThemePreference();
  const activeColor = useCSSVariable("--color-primary-foreground") as string;
  const inactiveColor = useCSSVariable("--color-muted-foreground") as string;

  return (
    <View className="gap-sm">
      <Text className="text-sm text-muted-foreground">Appearance</Text>
      <View className="flex-row gap-xs rounded-lg border border-border bg-card p-xs">
        {OPTIONS.map(({ value, Icon }) => {
          const selected = preference === value;

          return (
            <Pressable
              key={value}
              onPress={() => setPreference(value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={THEME_LABELS[value]}
              className={cn(
                "h-[40px] flex-1 flex-row items-center justify-center gap-sm rounded-md",
                selected && "bg-primary",
              )}
              style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
            >
              <Icon size={16} color={selected ? activeColor : inactiveColor} />
              <Text
                className={cn(
                  "text-sm font-semibold",
                  selected ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {THEME_LABELS[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
