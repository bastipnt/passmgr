import type { GeneratorMode } from "@repo/crypto";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ToggleGroup";
import { KeyRoundIcon, TextIcon } from "lucide-react";

const modes = [
  { label: "Password", value: "password", icon: KeyRoundIcon },
  { label: "Passphrase", value: "passphrase", icon: TextIcon },
] as const;

type GeneratorModeSwitchProps = {
  mode: GeneratorMode;
  setMode: (newMode: GeneratorMode) => void;
};

export default function GeneratorModeSwitch({ mode, setMode }: GeneratorModeSwitchProps) {
  return (
    <ToggleGroup
      className="w-full"
      value={[mode]}
      onValueChange={(value) => {
        const next = value[0] as GeneratorMode | undefined;
        if (next) setMode(next);
      }}
    >
      {modes.map(({ label, value, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
