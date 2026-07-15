import { useCallback, useState } from "react";
import { Uniwind } from "uniwind";
import { usePreferences, type PreferencesStore } from "@repo/client";

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

export function useThemePreference() {
  const preferences = usePreferences();
  const [preference, setPreferenceState] = useState(() => getStoredTheme(preferences));

  const setPreference = useCallback(
    (next: ThemePreference) => {
      preferences.set(STORAGE_KEY, next);
      Uniwind.setTheme(next);
      setPreferenceState(next);
    },
    [preferences],
  );

  return { preference, setPreference };
}
