import { BIOMETRIC_KEY, type BiometricKeyMaterial } from "@repo/crypto";
import { VAULT_KEY, type VaultKeyMaterial } from "@repo/schema";
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
 * VAULT KEYS
 */

export async function upsertVaultKey(vaultKey: VaultKeyMaterial, db: LocalDb): Promise<void> {
  await upsertEntries(
    // Only `passwordKekParams` is structured; `getVaultKey` parses it back.
    Object.entries(vaultKey).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
    db,
  );
}

export async function getVaultKey(db: LocalDb): Promise<VaultKeyMaterial | null> {
  const res = await getEntries(VAULT_KEY, db);
  if (Object.keys(res).length < VAULT_KEY.length) return null;

  return {
    ...res,
    passwordKekParams: JSON.parse(res.passwordKekParams ?? ""),
  } as VaultKeyMaterial;
}

/**
 * BIOMETRIC KEYS
 */

export async function upsertBiometricVaultKey(
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
