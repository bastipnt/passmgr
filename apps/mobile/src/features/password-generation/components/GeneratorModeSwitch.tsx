import type { GeneratorMode } from "@repo/crypto";
import { SegmentedControl } from "@repo/ui-native";

const MODES: { value: GeneratorMode; label: string }[] = [
  { value: "password", label: "Password" },
  { value: "passphrase", label: "Passphrase" },
];

type GeneratorModeSwitchProps = {
  mode: GeneratorMode;
  setMode: (newMode: GeneratorMode) => void;
};

/** Segmented control shared by the generator sheet and the generator settings. */
export default function GeneratorModeSwitch({ mode, setMode }: GeneratorModeSwitchProps) {
  return <SegmentedControl value={mode} options={MODES} onChange={setMode} />;
}
