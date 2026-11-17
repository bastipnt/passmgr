import {
  type GeneratorMode,
  PASSPHRASE_DEFAULTS,
  PASSPHRASE_WORDS_RANGE,
  PASSWORD_DEFAULTS,
  PASSWORD_LENGTH_RANGE,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto";
import { useCallback, useMemo } from "react";
import { PREF_KEYS } from "../preferences/preference-keys";
import { isRecord, usePreference } from "./use-preference";

export type GeneratorDefaults = {
  mode: GeneratorMode;
  pwOpts: PasswordOptions;
  phOpts: PassphraseOptions;
};

const isGeneratorMode = (value: unknown): value is GeneratorMode =>
  value === "password" || value === "passphrase";

const inRange = (value: number, range: { min: number; max: number }) =>
  Number.isInteger(value) && value >= range.min && value <= range.max;

const isCount = (value: number) => Number.isInteger(value) && value >= 0;

function isUsablePasswordOptions(options: PasswordOptions): boolean {
  return (
    inRange(options.length, PASSWORD_LENGTH_RANGE) &&
    isCount(options.minDigits) &&
    isCount(options.minSymbols) &&
    options.minDigits + options.minSymbols <= options.length &&
    (options.uppercase || options.lowercase || options.digits || options.symbols)
  );
}

function isUsablePassphraseOptions(options: PassphraseOptions): boolean {
  return inRange(options.wordCount, PASSPHRASE_WORDS_RANGE);
}

/**
 * Stored options over the defaults, field by field, so an option added in a later
 * release doesn't reset the rest. A set the generator can't run with (a length out
 * of range, minimums over the length) gives the defaults.
 */
function storedOptions<T extends Record<string, unknown>>(
  defaults: T,
  stored: Record<string, unknown>,
  isUsable: (options: T) => boolean,
): T {
  const merged = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof stored[key] === typeof fallback ? stored[key] : fallback,
    ]),
  ) as T;
  return isUsable(merged) ? merged : defaults;
}

function useStoredGeneratorOptions() {
  const [mode, setMode] = usePreference<GeneratorMode>(
    PREF_KEYS.generatorMode,
    "password",
    isGeneratorMode,
  );
  const [storedPw, setPwOpts] = usePreference<Record<string, unknown>>(
    PREF_KEYS.generatorPasswordOptions,
    PASSWORD_DEFAULTS,
    isRecord,
  );
  const [storedPh, setPhOpts] = usePreference<Record<string, unknown>>(
    PREF_KEYS.generatorPassphraseOptions,
    PASSPHRASE_DEFAULTS,
    isRecord,
  );
  const pwOpts = useMemo(
    () => storedOptions(PASSWORD_DEFAULTS, storedPw, isUsablePasswordOptions),
    [storedPw],
  );
  const phOpts = useMemo(
    () => storedOptions(PASSPHRASE_DEFAULTS, storedPh, isUsablePassphraseOptions),
    [storedPh],
  );

  return {
    mode,
    pwOpts,
    phOpts,
    setMode,
    setPwOpts: setPwOpts as (options: PasswordOptions) => void,
    setPhOpts: setPhOpts as (options: PassphraseOptions) => void,
  };
}

/**
 * The saved generator defaults, read-only — what a generator opens with. Edits
 * made inside a generator are per-password and never written back here; the
 * settings screens own the writes (`useGeneratorPreferences`).
 */
export function useGeneratorDefaults(): GeneratorDefaults {
  const { mode, pwOpts, phOpts } = useStoredGeneratorOptions();
  return { mode, pwOpts, phOpts };
}

export function useGeneratorPreferences() {
  const options = useStoredGeneratorOptions();
  const { setMode, setPwOpts, setPhOpts } = options;

  const resetToDefaults = useCallback(() => {
    setMode("password");
    setPwOpts(PASSWORD_DEFAULTS);
    setPhOpts(PASSPHRASE_DEFAULTS);
  }, [setMode, setPwOpts, setPhOpts]);

  return { ...options, resetToDefaults };
}
