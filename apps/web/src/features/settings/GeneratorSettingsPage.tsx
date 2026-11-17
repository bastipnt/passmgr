import { useGeneratorPreferences } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import { RotateCcwIcon } from "lucide-react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import { PassphraseOptionsForm, PasswordOptionsForm } from "@/features/password-generation";
import GeneratorModeSwitch from "../password-generation/GeneratorModeSwitch";

export default function GeneratorSettingsPage() {
  const { mode, setMode, pwOpts, setPwOpts, phOpts, setPhOpts, resetToDefaults } =
    useGeneratorPreferences();

  return (
    <>
      <PanelHeader>
        <PanelTitle>Password Generator</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
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
              <ItemTitle>
                {mode === "password" ? "Password options" : "Passphrase options"}
              </ItemTitle>
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
    </>
  );
}
