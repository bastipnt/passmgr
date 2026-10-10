import type { MemberVault, VaultKind, VaultMeta, VaultRole } from "@repo/schema";
import { secretsStore } from "@repo/store";

/** A vault as the UI shows it: its decrypted metadata with the user's role in it. */
export type VaultInfo = VaultMeta & {
  vaultId: string;
  kind: VaultKind;
  role: VaultRole;
};

/** Which records the list shows: every vault's ("all"), or one vault's (its id). */
export type VaultFilter = string;

/**
 * Icons a vault can carry, by name (`VaultMeta.icon`). Web and mobile map each
 * name to their icon set; an unknown name (a newer client's) shows the default.
 */
export const VAULT_ICONS = [
  "vault",
  "briefcase",
  "home",
  "users",
  "heart",
  "star",
  "code",
  "wallet",
  "plane",
  "gamepad",
] as const;
export type VaultIcon = (typeof VAULT_ICONS)[number];
export const DEFAULT_VAULT_ICON: VaultIcon = "vault";

/** The icons' accessible names in the pickers. */
export const VAULT_ICON_LABELS: Record<VaultIcon, string> = {
  vault: "Vault",
  briefcase: "Briefcase",
  home: "House",
  users: "People",
  heart: "Heart",
  star: "Star",
  code: "Code",
  wallet: "Wallet",
  plane: "Plane",
  gamepad: "Game controller",
};

/**
 * Colours a vault can carry, by name (`VaultMeta.color`), as the oklch hue
 * both apps tint its tile with (like `RECORD_TYPE_HUES`).
 */
export const VAULT_COLORS = {
  violet: 290,
  blue: 255,
  teal: 190,
  green: 150,
  amber: 80,
  orange: 50,
  rose: 15,
  pink: 340,
} as const;
export type VaultColor = keyof typeof VAULT_COLORS;

/** The colours' accessible names in the pickers. */
export const VAULT_COLOR_LABELS: Record<VaultColor, string> = {
  violet: "Violet",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  rose: "Rose",
  pink: "Pink",
};
export const DEFAULT_VAULT_COLOR: VaultColor = "violet";

export function vaultIcon(vault: Pick<VaultMeta, "icon">): VaultIcon {
  return VAULT_ICONS.find((icon) => icon === vault.icon) ?? DEFAULT_VAULT_ICON;
}

export function vaultColor(vault: Pick<VaultMeta, "color">): VaultColor {
  return (
    (Object.keys(VAULT_COLORS) as VaultColor[]).find((c) => c === vault.color) ??
    DEFAULT_VAULT_COLOR
  );
}

/** The hue of the vault's tile. */
export function vaultHue(vault: Pick<VaultMeta, "color">): number {
  return VAULT_COLORS[vaultColor(vault)];
}

/**
 * Decrypt the vaults' metadata, the personal vault first, then by name. A vault
 * whose key isn't loaded (its wrap didn't open) or whose metadata doesn't open
 * is left out, as its records are.
 */
export function decryptVaults(rows: readonly MemberVault[]): VaultInfo[] {
  const vaults: VaultInfo[] = [];
  for (const row of rows) {
    try {
      const meta = secretsStore.decryptVaultMeta(row);
      vaults.push({ ...meta, vaultId: row.vaultId, kind: row.kind, role: row.role });
    } catch {
      // Hidden like its records; `reloadVaultKeys` logs the skipped keys.
    }
  }
  return vaults.sort(
    (a, b) =>
      Number(b.kind === "personal") - Number(a.kind === "personal") ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Whether two decrypted lists show the same vaults, in the same order, the same way. */
export function sameVaultInfos(a: readonly VaultInfo[], b: readonly VaultInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every((vault, i) => {
      const other = b[i]!;
      return (
        vault.vaultId === other.vaultId &&
        vault.kind === other.kind &&
        vault.role === other.role &&
        vault.name === other.name &&
        vault.icon === other.icon &&
        vault.color === other.color
      );
    })
  );
}
