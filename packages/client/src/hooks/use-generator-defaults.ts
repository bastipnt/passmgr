import {
  type GeneratorMode,
  PASSPHRASE_DEFAULTS,
  PASSWORD_DEFAULTS,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto";
import { PREF_KEYS } from "../preferences/preference-keys";
import { usePreference } from "./use-preference";

export type GeneratorDefaults = {
  mode: GeneratorMode;
  pwOpts: PasswordOptions;
  phOpts: PassphraseOptions;
};

/**
 * The saved generator defaults, read-only — what a generator opens with. Edits
 * made inside a generator are per-password and never written back here; the
 * settings screens own the writes.
 */
export function useGeneratorDefaults(): GeneratorDefaults {
  const [mode] = usePreference<GeneratorMode>(PREF_KEYS.generatorMode, "password");
  const [pwOpts] = usePreference<PasswordOptions>(
    PREF_KEYS.generatorPasswordOptions,
    PASSWORD_DEFAULTS,
  );
  const [phOpts] = usePreference<PassphraseOptions>(
    PREF_KEYS.generatorPassphraseOptions,
    PASSPHRASE_DEFAULTS,
  );

  return { mode, pwOpts, phOpts };
}
