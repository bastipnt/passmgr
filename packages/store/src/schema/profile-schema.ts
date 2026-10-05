import type { LocalDb } from "../local-db";
import { profile } from "./tables";

/** The device profile: a local-only vault, or one linked to a server account. */
export type LocalProfile =
  | { profileId: string; mode: "local"; email: null; userId: null }
  | { profileId: string; mode: "linked"; email: string; userId: string };

export type ProfileMode = LocalProfile["mode"];

export async function clearProfileTable(db: LocalDb) {
  await db.delete(profile);
}

/** Replace the profile (there is only ever one). Run inside a transaction. */
export async function replaceProfile(next: LocalProfile, db: LocalDb) {
  await db.delete(profile);
  await db.insert(profile).values(next);
}

/** The profile, or null when none is stored or the row is inconsistent. */
export async function getProfile(db: LocalDb): Promise<LocalProfile | null> {
  const rows = await db.select().from(profile);
  if (rows.length !== 1) return null;
  const row = rows[0]!;

  if (row.mode === "local")
    return { profileId: row.profileId, mode: "local", email: null, userId: null };
  if (row.email === null || row.userId === null) return null;
  return { profileId: row.profileId, mode: "linked", email: row.email, userId: row.userId };
}
