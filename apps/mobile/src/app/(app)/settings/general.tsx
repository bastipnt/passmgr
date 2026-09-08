import { DEFAULT_SORT, PREF_KEYS, SORT_LABELS, type SortOption, usePreference } from "@repo/client";
import { OptionList, SettingsSection } from "@repo/ui-native";
import { ScrollView, Text, View } from "react-native";
import { ThemeSwitch } from "@/components/ThemeSwitch";

const sortOptions = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  label: SORT_LABELS[value],
  value,
}));

export default function GeneralSettingsScreen() {
  const [sort, setSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-lg p-md">
      <SettingsSection title="Language (coming soon)">
        <View className="rounded-md border border-border px-md py-sm opacity-50">
          <Text className="text-md text-muted-foreground">English</Text>
        </View>
      </SettingsSection>

      <SettingsSection title="Theme">
        <ThemeSwitch hideLabel />
      </SettingsSection>

      <SettingsSection title="Default sort order">
        <OptionList options={sortOptions} value={sort} onChange={setSort} />
      </SettingsSection>
    </ScrollView>
  );
}
