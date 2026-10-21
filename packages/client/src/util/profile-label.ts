import type { ProfileEntry } from "@repo/store";
import { hashString } from "@repo/util";
import { formatTimeAgo } from "../sync-summary";
import { VAULT_COLORS } from "../vaults/vault-info";

/** How a profile is named in lists: its account's email, or a local vault's name. */
export function profileLabel(entry: Pick<ProfileEntry, "email" | "name">): string {
  return entry.email ?? entry.name ?? "Vault on this device";
}

const PROFILE_HUES = Object.values(VAULT_COLORS);

/** The avatar hue of a profile: stable per profile, so vaults with the same initial differ. */
export function profileHue(entry: Pick<ProfileEntry, "profileId">): number {
  return PROFILE_HUES[hashString(entry.profileId) % PROFILE_HUES.length]!;
}

export function profileDetail(
  entry: Pick<ProfileEntry, "mode" | "lastUsedAt">,
  now = Date.now(),
): string {
  const kind = entry.mode === "linked" ? "Account" : "On this device only";
  return `${kind} · Last opened ${formatTimeAgo(Date.parse(entry.lastUsedAt), now)}`;
}
