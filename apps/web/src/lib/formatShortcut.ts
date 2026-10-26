// fallow-ignore-file unused-file
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl";

const specialKeyMap: Record<string, string> = {
  $mod: modKey,
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Enter: "Enter",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Del",
};

/**
 * Translate a tinykeys key binding string into display tokens.
 *
 * Examples:
 *   "$mod+Shift+c"  → ["⌘", "Shift", "C"]   (mac)
 *   "$mod+Shift+c"  → ["Ctrl", "Shift", "C"] (other)
 *   "ArrowDown"     → ["↓"]
 *   "Escape"        → ["Esc"]
 *   "?"             → ["?"]
 */
export function formatShortcut(key: string): string[] {
  return key.split("+").map((part) => {
    if (part in specialKeyMap) return specialKeyMap[part]!;
    if (part.length === 1) return part.toUpperCase();
    return part;
  });
}

/** A binding as one compact hint: "⌘⇧C" on a Mac, "Ctrl+Shift+C" elsewhere. */
export function shortcutHint(key: string): string {
  const tokens = formatShortcut(key);
  return isMac
    ? tokens.map((token) => (token === "Shift" ? "⇧" : token)).join("")
    : tokens.join("+");
}
