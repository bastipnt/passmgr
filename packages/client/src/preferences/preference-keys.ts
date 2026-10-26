/**
 * Every `PreferencesStore` key in one place. The values are the literals that
 * were already shipped — changing one silently resets that preference for
 * existing users.
 */
export const PREF_KEYS = {
  /** Read directly by `packages/ui` ThemeProvider and mobile `use-theme-preference`. */
  theme: "pass-mgr-theme",
  /** Same key as web's `ThemeProvider` (`<theme key>-accent`). */
  accent: "pass-mgr-theme-accent",
  sort: "pass-mgr-sort",
  /** Web "All vaults" list: grouped by vault ("By vault" in the sort menu). */
  groupByVault: "pass-mgr-group-by-vault",
  /** "all" or a vault id; a vault this profile doesn't have reads as "all". */
  vaultFilter: "pass-mgr-vault-filter",
  /** Per profile: see `biometricDismissedKey`. */
  biometricDismissed: "biometric-dismissed",
  /** Per profile: see `backupReminderSnoozedKey`. */
  backupReminderSnoozed: "backup-reminder-snoozed",
  recentRecords: "search.recent-records",
  /** Web categories sidebar, from `lg` up (narrower it is always collapsed). */
  sidebarCollapsed: "pass-mgr-sidebar-collapsed",

  generatorMode: "pass-mgr-generator-mode",
  generatorPasswordOptions: "pass-mgr-generator-password-options",
  generatorPassphraseOptions: "pass-mgr-generator-passphrase-options",

  clipboardClearSeconds: "pass-mgr-clipboard-clear",
  autoLockMinutes: "pass-mgr-auto-lock",
  revealTimeoutSeconds: "pass-mgr-reveal-timeout",
} as const;

export type PreferenceKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

/** The user declined biometric unlock for this profile (ADR 0001 D2: per profile). */
export function biometricDismissedKey(profileId: string): string {
  return `${PREF_KEYS.biometricDismissed}:${profileId}`;
}

/** When the user last put off the backup reminder for this profile (ADR 0001 D12). */
export function backupReminderSnoozedKey(profileId: string): string {
  return `${PREF_KEYS.backupReminderSnoozed}:${profileId}`;
}
