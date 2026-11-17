export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(
  value: unknown,
  fallback: ThemePreference = "system",
): ThemePreference {
  return THEME_PREFERENCES.find((theme) => theme === value) ?? fallback;
}
