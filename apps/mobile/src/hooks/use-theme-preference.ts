import { type PreferencesStore, usePreferences } from "@repo/client";
import { useCallback, useState } from "react";
import { Appearance } from "react-native";
import { Uniwind } from "uniwind";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const STORAGE_KEY = "pass-mgr-theme";

export function getStoredTheme(preferences: PreferencesStore): ThemePreference {
  const stored = preferences.get(STORAGE_KEY);
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
      preferences.set(STORAGE_KEY, next);
      applyTheme(next);
      setPreferenceState(next);
    },
    [preferences],
  );

  return { preference, setPreference };
}
