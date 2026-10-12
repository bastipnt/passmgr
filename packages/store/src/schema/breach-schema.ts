import { and, eq, inArray, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { breachChecks, profileSettings } from "./tables";

const BREACH_CHECK_SETTING = "breachCheck";
// Bound parameters per statement stay well under SQLite's limit.
const CHUNK = 200;

/** One record version's breach check result. */
export type BreachCheck = {
  recordId: string;
  version: number;
  clientUpdatedAt: string;
  vaultId: string;
  /** How often the password appears in known breaches; 0 = not found. */
  count: number;
  checkedAt: string;
};

export type BreachCheckVersion = Pick<BreachCheck, "recordId" | "version" | "clientUpdatedAt">;

export const breachCheckKey = (v: BreachCheckVersion) =>
  `${v.recordId}|${v.version}|${v.clientUpdatedAt}`;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

const atVersion = (v: BreachCheckVersion) =>
  and(
    eq(breachChecks.recordId, v.recordId),
    eq(breachChecks.version, v.version),
    eq(breachChecks.clientUpdatedAt, v.clientUpdatedAt),
  );

export async function clearProfileSettingsTable(db: LocalDb) {
  await db.delete(profileSettings);
}

export async function clearBreachChecks(db: LocalDb) {
  await db.delete(breachChecks);
}

export async function isBreachCheckEnabled(db: LocalDb): Promise<boolean> {
  const rows = await db
    .select()
    .from(profileSettings)
    .where(eq(profileSettings.key, BREACH_CHECK_SETTING));
  return rows[0]?.value === "on";
}

/** Turn the breach check on, or off: off forgets every result. Run inside a transaction. */
export async function setBreachCheckEnabled(enabled: boolean, db: LocalDb) {
  if (enabled) {
    await db
      .insert(profileSettings)
      .values({ key: BREACH_CHECK_SETTING, value: "on" })
      .onConflictDoUpdate({ target: profileSettings.key, set: { value: "on" } });
  } else {
    await db.delete(profileSettings).where(eq(profileSettings.key, BREACH_CHECK_SETTING));
    await clearBreachChecks(db);
  }
}

export async function getBreachChecks(db: LocalDb): Promise<BreachCheck[]> {
  return await db.select().from(breachChecks);
}

export async function getBreachCheck(
  version: BreachCheckVersion,
  db: LocalDb,
): Promise<BreachCheck | null> {
  const rows = await db.select().from(breachChecks).where(atVersion(version));
  return rows[0] ?? null;
}

export async function upsertBreachChecks(checks: readonly BreachCheck[], db: LocalDb) {
  for (const batch of chunks(checks)) {
    await db
      .insert(breachChecks)
      .values(batch)
      .onConflictDoUpdate({
        target: [breachChecks.recordId, breachChecks.version, breachChecks.clientUpdatedAt],
        set: { count: sql`excluded.count`, checkedAt: sql`excluded.checkedAt` },
      });
  }
}

export async function deleteBreachChecksOf(recordIds: Iterable<string>, db: LocalDb) {
  for (const batch of chunks([...recordIds])) {
    await db.delete(breachChecks).where(inArray(breachChecks.recordId, batch));
  }
}

export async function deleteVaultBreachChecks(vaultIds: readonly string[], db: LocalDb) {
  for (const batch of chunks(vaultIds)) {
    await db.delete(breachChecks).where(inArray(breachChecks.vaultId, batch));
  }
}

/** Drop the results of every version not in `current`. Run inside a transaction. */
export async function retainBreachChecks(current: readonly BreachCheckVersion[], db: LocalDb) {
  const keep = new Set(current.map(breachCheckKey));
  for (const row of await getBreachChecks(db)) {
    if (!keep.has(breachCheckKey(row))) await db.delete(breachChecks).where(atVersion(row));
  }
}
