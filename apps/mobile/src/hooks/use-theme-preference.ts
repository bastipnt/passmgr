import { PREF_KEYS, type PreferencesStore, usePreferences } from "@repo/client";
import { type AccentPreset, accentVariables, parseAccent } from "@repo/ui-shared";
import { useCallback, useState } from "react";
import { Appearance } from "react-native";
import { Uniwind } from "uniwind";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function getStoredTheme(preferences: PreferencesStore): ThemePreference {
  const stored = preferences.get(PREF_KEYS.theme);
  if (stored && stored in THEME_LABELS) return stored as ThemePreference;
  return "system";
}

/**
 * Applies the theme to both layers: Uniwind styles the JS tree, while UIKit paints the
 * native chrome (stack headers, tab bar, keyboard, alerts) from `Appearance` alone — so
 * without this the native parts stay light while the app renders dark. "unspecified"
 * hands control back to the OS.
 */
export function applyTheme(theme: ThemePreference) {
  Uniwind.setTheme(theme);
  Appearance.setColorScheme(theme === "system" ? "unspecified" : theme);
}

export function useThemePreference() {
  const preferences = usePreferences();
  const [preference, setPreferenceState] = useState(() => getStoredTheme(preferences));

  const setPreference = useCallback(
    (next: ThemePreference) => {
      preferences.set(PREF_KEYS.theme, next);
      applyTheme(next);
      setPreferenceState(next);
    },
    [preferences],
  );

  return { preference, setPreference };
}

export function getStoredAccent(preferences: PreferencesStore): AccentPreset {
  return parseAccent(preferences.get(PREF_KEYS.accent));
}

/** global.css holds one palette; a preset overrides it in both modes, so system switches keep it. */
export function applyAccent(accent: AccentPreset) {
  for (const mode of ["light", "dark"] as const) {
    Uniwind.updateCSSVariables(mode, accentVariables(accent, mode));
  }
}

export function useAccentPreference() {
  const preferences = usePreferences();
  const [accent, setAccentState] = useState(() => getStoredAccent(preferences));

  const setAccent = useCallback(
    (next: AccentPreset) => {
      preferences.set(PREF_KEYS.accent, next);
      applyAccent(next);
      setAccentState(next);
    },
    [preferences],
  );

  return { accent, setAccent };
}
