import { type ChoicePreference, useChoicePreference } from "@repo/client";
import { OptionList, SettingsSection } from "@repo/ui-native";

type SettingsChoiceProps = {
  title: string;
  description: string;
  preference: ChoicePreference;
};

/** One duration preference rendered as a titled radio list — web's `ChoiceSetting`. */
export function SettingsChoice({ title, description, preference }: SettingsChoiceProps) {
  const [value, setValue] = useChoicePreference(preference);

  return (
    <SettingsSection flush title={title} description={description}>
      <OptionList options={preference.choices} value={value} onChange={setValue} />
    </SettingsSection>
  );
}
