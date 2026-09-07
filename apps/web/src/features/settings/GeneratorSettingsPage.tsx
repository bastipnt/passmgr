import { PREF_KEYS, usePreference } from "@repo/client";
import {
  type GeneratorMode,
  PASSPHRASE_DEFAULTS,
  PASSWORD_DEFAULTS,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto";
import { Button } from "@repo/ui/components/Button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import { RotateCcwIcon } from "lucide-react";
import { PassphraseOptionsForm, PasswordOptionsForm } from "@/features/password-generation";
import GeneratorModeSwitch from "../password-generation/GeneratorModeSwitch";

export default function GeneratorSettingsPage() {
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
    <div className="p-4">
      <ItemGroup>
        <Item variant="outline">
          <ItemContent className="gap-2">
            <ItemTitle>Default generator</ItemTitle>
            <ItemDescription>
              What the generator opens with. Changes you make inside the generator apply to that
              password only.
            </ItemDescription>

            <GeneratorModeSwitch mode={mode} setMode={setMode} />
          </ItemContent>
        </Item>

        <Item variant="outline">
          <ItemContent className="gap-2">
            <ItemTitle>{mode === "password" ? "Password options" : "Passphrase options"}</ItemTitle>
            {mode === "password" ? (
              <PasswordOptionsForm pwOpts={pwOpts} setPwOpts={(cb) => setPwOpts(cb(pwOpts))} />
            ) : (
              <PassphraseOptionsForm phOpts={phOpts} setPhOpts={(cb) => setPhOpts(cb(phOpts))} />
            )}
          </ItemContent>
        </Item>

        <Item variant="outline">
          <ItemContent className="gap-2">
            <ItemTitle>Reset</ItemTitle>
            <div>
              <Button variant="outline" onClick={resetToDefaults}>
                <RotateCcwIcon />
                Reset to defaults
              </Button>
            </div>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
