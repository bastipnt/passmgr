import { PREF_KEYS, usePreference } from "@repo/client";
import {
  type GeneratorMode,
  PASSPHRASE_DEFAULTS,
  PASSWORD_DEFAULTS,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto";
import { Button, SettingsSection } from "@repo/ui-native";
import { ScrollView } from "react-native";
import GeneratorModeSwitch from "@/features/password-generation/components/GeneratorModeSwitch";
import PassphraseOptionsForm from "@/features/password-generation/components/PassphraseOptions";
import PasswordOptionsForm from "@/features/password-generation/components/PasswordOptionsForm";

export default function GeneratorSettingsScreen() {
  const [mode, setMode] = usePreference<GeneratorMode>(PREF_KEYS.generatorMode, "password");
  const [pwOpts, setPwOpts] = usePreference<PasswordOptions>(
    PREF_KEYS.generatorPasswordOptions,
    PASSWORD_DEFAULTS,
  );
  const [phOpts, setPhOpts] = usePreference<PassphraseOptions>(
    PREF_KEYS.generatorPassphraseOptions,
    PASSPHRASE_DEFAULTS,
  );

  function resetToDefaults() {
    setMode("password");
    setPwOpts(PASSWORD_DEFAULTS);
    setPhOpts(PASSPHRASE_DEFAULTS);
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-lg p-md">
      <SettingsSection
        title="Default generator"
        description="What the generator opens with. Changes you make inside the generator apply to that password only."
      >
        <GeneratorModeSwitch mode={mode} setMode={setMode} />
      </SettingsSection>

      <SettingsSection title={mode === "password" ? "Password options" : "Passphrase options"}>
        {mode === "password" ? (
          <PasswordOptionsForm pwOpts={pwOpts} setPwOpts={(cb) => setPwOpts(cb(pwOpts))} />
        ) : (
          <PassphraseOptionsForm phOpts={phOpts} setPhOpts={(cb) => setPhOpts(cb(phOpts))} />
        )}
      </SettingsSection>

      <SettingsSection title="Reset">
        <Button variant="outline" onPress={resetToDefaults}>
          Reset to defaults
        </Button>
      </SettingsSection>
    </ScrollView>
  );
}
