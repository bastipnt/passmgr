/**
 * Every `PreferencesStore` key in one place. The values are the literals that
 * were already shipped — changing one silently resets that preference for
 * existing users.
 */
export const PREF_KEYS = {
  /** Read directly by `packages/ui` ThemeProvider and mobile `use-theme-preference`. */
  theme: "pass-mgr-theme",
  sort: "pass-mgr-sort",
  biometricDismissed: "biometric-dismissed",
  recentRecords: "search.recent-records",

  generatorMode: "pass-mgr-generator-mode",
  generatorPasswordOptions: "pass-mgr-generator-password-options",
  generatorPassphraseOptions: "pass-mgr-generator-passphrase-options",

  clipboardClearSeconds: "pass-mgr-clipboard-clear",
  autoLockMinutes: "pass-mgr-auto-lock",
  revealTimeoutSeconds: "pass-mgr-reveal-timeout",
} as const;

export type PreferenceKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];
