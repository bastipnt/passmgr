import { SegmentedControl } from "@repo/ui-native";
import { Text, View } from "react-native";
import {
  THEME_LABELS,
  type ThemePreference,
  useThemePreference,
} from "@/hooks/use-theme-preference";

const OPTIONS = (["system", "light", "dark"] as const satisfies ThemePreference[]).map((value) => ({
  value,
  label: THEME_LABELS[value],
}));

type ThemeSwitchProps = {
  /** The settings screen already titles the section. */
  hideLabel?: boolean;
};

export function ThemeSwitch({ hideLabel = false }: ThemeSwitchProps) {
  const { preference, setPreference } = useThemePreference();

  return (
    <View className="gap-2">
      {!hideLabel && <Text className="text-muted-foreground text-sm">Appearance</Text>}
      <SegmentedControl value={preference} options={OPTIONS} onChange={setPreference} />
    </View>
  );
}
