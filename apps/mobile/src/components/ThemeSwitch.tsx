import { SegmentedControl } from "@repo/ui-native";
import { THEME_PREFERENCES } from "@repo/ui-shared";
import { Text, View } from "react-native";
import { THEME_LABELS, useThemePreference } from "@/hooks/use-theme-preference";

const OPTIONS = THEME_PREFERENCES.map((value) => ({
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
