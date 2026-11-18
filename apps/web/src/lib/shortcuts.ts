export type ShortcutGroup = "vault" | "app";

export type ShortcutSpec = { key: string; description: string; group: ShortcutGroup };

/**
 * Every keyboard shortcut of the web app (tinykeys bindings). The `?` dialog
 * lists the ones registered on the current screen, Settings → Keyboard
 * shortcuts all of them: both read the binding and its text from here.
 */
export const SHORTCUTS = {
  focusSearch: { key: "$mod+k", description: "Focus search", group: "vault" },
  createRecord: { key: "$mod+Shift+n", description: "Create new record", group: "vault" },
  nextRecord: { key: "ArrowDown", description: "Next record", group: "vault" },
  previousRecord: { key: "ArrowUp", description: "Previous record", group: "vault" },
  copyPassword: { key: "$mod+Shift+c", description: "Copy password", group: "vault" },
  copyUsername: { key: "$mod+Shift+u", description: "Copy username", group: "vault" },
  editRecord: { key: "$mod+e", description: "Edit record", group: "vault" },
  lockVault: { key: "$mod+l", description: "Lock vault", group: "app" },
  showShortcuts: { key: "Shift+?", description: "Show keyboard shortcuts", group: "app" },
  searchSettings: { key: "/", description: "Search settings", group: "app" },
  // Also a `KeyboardEvent.key`: `OverlayHeader` listens for it itself (`useShortcut` would prevent the default).
  closeSettings: { key: "Escape", description: "Close settings", group: "app" },
} as const satisfies Record<string, ShortcutSpec>;

export const SHORTCUT_GROUPS: readonly { group: ShortcutGroup; label: string }[] = [
  { group: "vault", label: "Vault" },
  { group: "app", label: "App" },
];
