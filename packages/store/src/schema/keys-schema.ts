import { BIOMETRIC_KEY, type BiometricKeyMaterial } from "@repo/crypto";
import { ACCOUNT_KEY_MATERIAL_KEYS, type AccountKeyMaterial } from "@repo/schema";
import { inArray, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { keyMaterial } from "./tables";

export async function clearKeysTable(db: LocalDb) {
  await db.delete(keyMaterial);
}

/** Upsert key/value pairs in one statement, so a partial write can't happen. */
async function upsertEntries(entries: [key: string, value: string][], db: LocalDb) {
  if (entries.length === 0) return;
  await db
    .insert(keyMaterial)
    .values(entries.map(([key, value]) => ({ key, value })))
    .onConflictDoUpdate({ target: keyMaterial.key, set: { value: sql`excluded.value` } });
}

async function getEntries(keys: readonly string[], db: LocalDb): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(keyMaterial)
    .where(inArray(keyMaterial.key, [...keys]));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * ACCOUNT KEY (password wrap + email, for offline unlock)
 */

export async function upsertAccountKey(material: AccountKeyMaterial, db: LocalDb): Promise<void> {
  await upsertEntries(
    // Only `passwordKekParams` is structured; `getAccountKey` parses it back.
    Object.entries(material).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
    db,
  );
}

export async function getAccountKey(db: LocalDb): Promise<AccountKeyMaterial | null> {
  const res = await getEntries(ACCOUNT_KEY_MATERIAL_KEYS, db);
  if (Object.keys(res).length < ACCOUNT_KEY_MATERIAL_KEYS.length) return null;

  return {
    ...res,
    passwordKekParams: JSON.parse(res.passwordKekParams ?? ""),
  } as AccountKeyMaterial;
}

/**
 * BIOMETRIC KEYS
 */

export async function upsertBiometricKey(
  biometricKey: BiometricKeyMaterial,
  db: LocalDb,
): Promise<void> {
  await upsertEntries(Object.entries(biometricKey), db);
}

export async function getBiometricKey(db: LocalDb): Promise<BiometricKeyMaterial | null> {
  const res = await getEntries(BIOMETRIC_KEY, db);
  if (Object.keys(res).length < BIOMETRIC_KEY.length) return null;

  return res as BiometricKeyMaterial;
}

export async function clearBiometricKey(db: LocalDb): Promise<void> {
  await db.delete(keyMaterial).where(inArray(keyMaterial.key, [...BIOMETRIC_KEY]));
}
