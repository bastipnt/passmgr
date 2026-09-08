import { type PreferenceChoice, usePreference } from "@repo/client";
import { OptionList, SettingsSection } from "@repo/ui-native";

type SettingsChoiceProps = {
  title: string;
  description: string;
  choices: PreferenceChoice[];
  prefKey: string;
  fallback: number;
};

/** One duration preference rendered as a titled radio list — web's `ChoiceSetting`. */
export function SettingsChoice({
  title,
  description,
  choices,
  prefKey,
  fallback,
}: SettingsChoiceProps) {
  const [value, setValue] = usePreference<number>(prefKey, fallback);

  return (
    <SettingsSection title={title} description={description}>
      <OptionList options={choices} value={value} onChange={setValue} />
    </SettingsSection>
  );
}
