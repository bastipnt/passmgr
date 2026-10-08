import type { ProfileEntry } from "@repo/store";

/** How a profile is named in lists: its account's email, or a local vault's name. */
export function profileLabel(entry: Pick<ProfileEntry, "email" | "name">): string {
  return entry.email ?? entry.name ?? "Vault on this device";
}
