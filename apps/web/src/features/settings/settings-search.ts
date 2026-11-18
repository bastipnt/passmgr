import { settingsPaths } from "@/app/route-paths";
import type { SettingsSection } from "./settings-sections";

/**
 * Where a search result lands on its page: a row by its label, else a group by
 * its label, both as rendered (`SettingsRow` / `SettingsGroup`). Neither: the page top.
 */
export type SettingTarget = {
  group?: string;
  row?: string;
  /** Where to land when the page doesn't show the target now (the generator's other mode). */
  fallback?: { group?: string; row?: string };
};

export type SettingEntry = SettingTarget & {
  path: string;
  /** What the result says; the row's label unless the row has none of its own. */
  label: string;
  synonyms?: readonly string[];
  /** Only an online account has it, or only a vault without one. */
  account?: "linked" | "local";
};

const {
  account,
  devices,
  sync,
  vaults,
  tags,
  trash,
  backup,
  security,
  appearance,
  generator,
  shortcuts,
} = settingsPaths;

/** Every setting a search finds, beside the sections themselves, in page order. */
export const SETTINGS_INDEX: readonly SettingEntry[] = [
  {
    path: account,
    label: "Password",
    row: "Password",
    synonyms: ["master password", "change password"],
  },
  {
    path: account,
    label: "Two-factor authentication",
    row: "Two-factor authentication",
    synonyms: ["2fa", "mfa", "totp", "otp", "authenticator", "backup codes"],
    account: "linked",
  },
  {
    path: account,
    label: "Online account",
    row: "Online account",
    synonyms: ["create account", "sign up", "sync"],
    account: "local",
  },
  {
    path: account,
    label: "Remove from this device",
    row: "Remove from this device",
    synonyms: ["remove vault"],
  },
  {
    path: account,
    label: "Delete account",
    row: "Delete account",
    synonyms: ["close account"],
    account: "linked",
  },
  {
    path: devices,
    label: "Signed-in devices",
    group: "Signed-in devices",
    synonyms: ["sessions", "sign out"],
  },
  {
    path: devices,
    label: "Account activity",
    group: "Account activity",
    synonyms: ["log", "history", "events"],
  },
  { path: sync, label: "Sync", group: "Sync", synonyms: ["server", "status", "offline"] },
  {
    path: sync,
    label: "Storage on this device",
    group: "Storage on this device",
    synonyms: ["persistent", "quota", "disk", "space", "keep data"],
  },
  {
    path: vaults,
    label: "Your vaults",
    group: "Your vaults",
    synonyms: ["new vault", "rename vault", "share", "members"],
  },
  { path: tags, label: "All tags", group: "All tags", synonyms: ["rename tag", "labels"] },
  {
    path: trash,
    label: "Deleted items",
    synonyms: ["restore", "recycle bin", "empty trash", "deleted"],
  },
  {
    path: backup,
    label: "Encrypted backup",
    row: "Encrypted backup",
    synonyms: ["backup", "export", "download", "json"],
  },
  {
    path: backup,
    label: "Plain file for another app",
    row: "Plain file for another app",
    synonyms: ["export", "csv", "unencrypted"],
  },
  {
    path: backup,
    label: "Import",
    group: "Import",
    synonyms: ["restore", "bitwarden", "1password", "keepass", "csv"],
  },
  {
    path: security,
    label: "Lock when idle",
    row: "Lock when idle",
    synonyms: ["lock", "auto-lock", "timeout"],
  },
  {
    path: security,
    label: "Clear clipboard",
    row: "Clear clipboard",
    synonyms: ["copy", "timeout"],
  },
  {
    path: security,
    label: "Hide revealed values",
    row: "Hide revealed values",
    synonyms: ["reveal", "show password", "mask", "timeout"],
  },
  {
    path: security,
    label: "Show website icons",
    row: "Show website icons",
    synonyms: ["favicons", "privacy"],
  },
  {
    path: appearance,
    label: "Theme",
    group: "Theme",
    row: "Theme",
    synonyms: ["dark mode", "light mode", "color scheme"],
  },
  {
    path: appearance,
    label: "Accent",
    group: "Accent",
    row: "Accent",
    synonyms: ["accent color", "colour"],
  },
  { path: appearance, label: "Default sort order", row: "Default sort order", synonyms: ["sort"] },
  { path: appearance, label: "Language", row: "Language", synonyms: ["locale", "translation"] },
  {
    path: generator,
    label: "Opens with",
    row: "Opens with",
    synonyms: ["password or passphrase", "mode", "default"],
  },
  {
    path: generator,
    label: "Length",
    row: "Length",
    synonyms: ["characters", "words"],
    fallback: { row: "Opens with" },
  },
  {
    path: generator,
    label: "Characters",
    group: "Characters",
    synonyms: ["uppercase", "lowercase", "digits", "numbers", "symbols"],
    fallback: { row: "Opens with" },
  },
  {
    path: generator,
    label: "Avoid look-alikes",
    row: "Avoid look-alikes",
    synonyms: ["ambiguous", "similar characters"],
    fallback: { row: "Opens with" },
  },
  {
    path: generator,
    label: "Words",
    group: "Words",
    synonyms: ["passphrase", "separator", "capitalize"],
    fallback: { row: "Opens with" },
  },
  { path: shortcuts, label: "All shortcuts", synonyms: ["hotkeys", "keys", "keyboard"] },
];

export type SettingMatch = SettingEntry & { key: string };
export type SettingsMatchGroup = { section: SettingsSection; matches: SettingMatch[] };

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Lower is better: the label starts with the query, its words do, a synonym's or the section's do.
function score(query: string[], label: string, others: readonly string[]): number | undefined {
  const labelWords = words(label);
  const prefixOf = (pool: string[]) =>
    query.every((token) => pool.some((w) => w.startsWith(token)));
  if (query.every((token, i) => labelWords[i]?.startsWith(token))) return 0;
  if (prefixOf(labelWords)) return 1;
  if (others.some((other) => prefixOf(words(other)))) return 2;
  if (prefixOf([...labelWords, ...others.flatMap(words)])) return 3;
  return undefined;
}

/**
 * The sections and settings that match `query`, grouped by section: groups in
 * the order of their best match, then the nav's; matches likewise. Every query
 * word has to begin a word of the setting, its synonyms or its section.
 */
export function matchSettings(
  query: string,
  sections: readonly SettingsSection[],
  index: readonly SettingEntry[] = SETTINGS_INDEX,
): SettingsMatchGroup[] {
  const tokens = words(query);
  if (tokens.length === 0) return [];

  const groups = sections.map((section, order) => {
    const candidates: SettingMatch[] = [
      { path: section.path, label: section.label, key: section.path },
      ...index
        .filter((entry) => entry.path === section.path)
        .map((entry) => ({ ...entry, key: `${entry.path}#${entry.label}` })),
    ];
    const scored = candidates.flatMap((match, position) => {
      const others = match.key === section.path ? [] : [...(match.synonyms ?? []), section.label];
      const value = score(tokens, match.label, others);
      return value === undefined ? [] : [{ match, value, position }];
    });
    scored.sort((a, b) => a.value - b.value || a.position - b.position);
    return {
      section,
      order,
      best: scored[0]?.value ?? Infinity,
      matches: scored.map((s) => s.match),
    };
  });

  return groups
    .filter((group) => group.matches.length > 0)
    .sort((a, b) => a.best - b.best || a.order - b.order)
    .map(({ section, matches }) => ({ section, matches }));
}

/** The entries an account of this kind has. */
export function settingsIndexFor(linked: boolean): SettingEntry[] {
  return SETTINGS_INDEX.filter(
    (entry) => !entry.account || (entry.account === "linked") === linked,
  );
}

function textOf(element: Element | null) {
  return element?.textContent?.trim();
}

/** The rendered row or group card `target` names, inside one settings page. */
export function findSettingTarget(page: ParentNode, target: SettingTarget): HTMLElement | null {
  const groups = [...page.querySelectorAll<HTMLElement>("[data-settings-group]")];
  const group = target.group
    ? groups.find(
        (element) => textOf(element.querySelector("[data-settings-group-label]")) === target.group,
      )
    : undefined;
  if (target.row) {
    const row = [...(group ?? page).querySelectorAll<HTMLElement>("[data-settings-row]")].find(
      (element) => textOf(element.querySelector("[data-settings-label]")) === target.row,
    );
    if (row) return row;
  }
  if (!group) return null;
  return group.querySelector<HTMLElement>("[data-slot=settings-card]") ?? group;
}

const HIGHLIGHT_MS = 1600;
const WAIT_MS = 2000;
// How long a shown page gets to render the target itself before the fallback is taken.
const FALLBACK_AFTER_MS = 300;

/**
 * Once the page at `path` is shown, scrolls `target` into view and highlights
 * it briefly. Polls: the page may still be sliding in (phone) or loading its rows.
 * Returns a cancel.
 */
export function revealSetting(path: string, target: SettingTarget): () => void {
  const deadline = performance.now() + WAIT_MS;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let highlighted: HTMLElement | undefined;
  let pageShownAt: number | undefined;
  const unhighlight = () => {
    if (highlighted) delete highlighted.dataset.highlighted;
  };

  const attempt = () => {
    const page = document.querySelector(`[data-settings-page="${CSS.escape(path)}"]`);
    if (page) pageShownAt ??= performance.now();
    const element =
      page &&
      (findSettingTarget(page, target) ??
        (target.fallback && performance.now() - (pageShownAt ?? 0) > FALLBACK_AFTER_MS
          ? findSettingTarget(page, target.fallback)
          : null));
    if (!element) {
      if (performance.now() < deadline) frame = requestAnimationFrame(attempt);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    highlighted = element;
    element.dataset.highlighted = "";
    timer = setTimeout(unhighlight, HIGHLIGHT_MS);
  };
  if (target.row || target.group) frame = requestAnimationFrame(attempt);

  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    unhighlight();
  };
}
