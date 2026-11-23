export type ThemePreference = "system" | "light" | "dark";

// Shipped storage keys: changing one resets the theme or accent for existing users.
export const THEME_STORAGE_KEY = "pass-mgr-theme";
export const ACCENT_STORAGE_KEY = "pass-mgr-theme-accent";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(
  value: unknown,
  fallback: ThemePreference = "system",
): ThemePreference {
  return THEME_PREFERENCES.find((theme) => theme === value) ?? fallback;
}
