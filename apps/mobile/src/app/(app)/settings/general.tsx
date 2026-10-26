import { DEFAULT_SORT, PREF_KEYS, SORT_LABELS, type SortOption, usePreference } from "@repo/client";
import { AccentPicker, OptionList, Screen, SectionGroup, SettingsSection } from "@repo/ui-native";
import { ACCENT_HINT } from "@repo/ui-shared";
import { ScrollView, Text, View } from "react-native";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useAccentPreference } from "@/hooks/use-theme-preference";

const sortOptions = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  label: SORT_LABELS[value],
  value,
}));

export default function GeneralSettingsScreen() {
  const [sort, setSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);
  const { accent, setAccent } = useAccentPreference();

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <SettingsSection flush title="Language (coming soon)">
          <SectionGroup>
            <View className="h-12 flex-row items-center px-5 opacity-50">
              <Text className="text-[16px] text-muted-foreground">English</Text>
            </View>
          </SectionGroup>
        </SettingsSection>

        <SettingsSection title="Theme">
          <ThemeSwitch hideLabel />
        </SettingsSection>

        <SettingsSection title="Accent" description={ACCENT_HINT}>
          <AccentPicker value={accent} onChange={setAccent} />
        </SettingsSection>

        <SettingsSection flush title="Default sort order">
          <OptionList options={sortOptions} value={sort} onChange={setSort} />
        </SettingsSection>
      </ScrollView>
    </Screen>
  );
}
