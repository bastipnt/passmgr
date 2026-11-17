import { PREF_KEYS } from "./preference-keys";

/**
 * The security preferences are a fixed set of durations rather than free input,
 * and both apps offer the same set — so the lists live here next to the keys
 * they are written under. `0` is "never" for all three.
 */
export type PreferenceChoice = { label: string; value: number };

export type ChoicePreference = {
  key: string;
  fallback: number;
  choices: PreferenceChoice[];
  isValid: (value: unknown) => value is number;
};

function choicePreference(
  key: string,
  fallback: number,
  choices: PreferenceChoice[],
): ChoicePreference {
  return {
    key,
    fallback,
    choices,
    isValid: (value): value is number => choices.some((choice) => choice.value === value),
  };
}

export const CLIPBOARD_CLEAR_PREFERENCE = choicePreference(PREF_KEYS.clipboardClearSeconds, 30, [
  { label: "Never", value: 0 },
  { label: "After 15 seconds", value: 15 },
  { label: "After 30 seconds", value: 30 },
  { label: "After 1 minute", value: 60 },
]);

export const AUTO_LOCK_PREFERENCE = choicePreference(PREF_KEYS.autoLockMinutes, 15, [
  { label: "Never", value: 0 },
  { label: "After 1 minute", value: 1 },
  { label: "After 5 minutes", value: 5 },
  { label: "After 15 minutes", value: 15 },
  { label: "After 30 minutes", value: 30 },
]);

export const REVEAL_TIMEOUT_PREFERENCE = choicePreference(PREF_KEYS.revealTimeoutSeconds, 30, [
  { label: "Never", value: 0 },
  { label: "After 10 seconds", value: 10 },
  { label: "After 30 seconds", value: 30 },
]);
