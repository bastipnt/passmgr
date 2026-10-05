import { BIOMETRIC_KEY, type BiometricKeyMaterial } from "@repo/crypto";
import {
  ACCOUNT_KEY_MATERIAL_KEYS,
  type AccountKeyMaterial,
  type ArgonParams,
  type RecoveryKeySchema,
  recoveryKeySchema,
  userKeyPairSchema,
} from "@repo/schema";
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
 * ACCOUNT KEY (password wrap + email + keypair, for offline unlock)
 */

export async function upsertAccountKey(material: AccountKeyMaterial, db: LocalDb): Promise<void> {
  await upsertEntries(
    // `passwordKekParams` and `userKeyPair` are structured; `getAccountKey` parses them back.
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

  // A corrupt entry counts as nothing stored (no offline unlock until the next
  // online login rewrites it) instead of throwing at every app start.
  let passwordKekParams: ArgonParams;
  let userKeyPair: unknown;
  try {
    passwordKekParams = JSON.parse(res.passwordKekParams ?? "");
    userKeyPair = JSON.parse(res.userKeyPair ?? "");
  } catch {
    return null;
  }
  const parsedKeyPair = userKeyPairSchema.safeParse(userKeyPair);
  if (!parsedKeyPair.success) return null;

  return { ...res, passwordKekParams, userKeyPair: parsedKeyPair.data } as AccountKeyMaterial;
}

/**
 * RECOVERY KEY (local profile only: the recovery wrap of the account key and
 * the verifier, kept on the device until linking uploads them, ADR 0001 D9)
 */

const RECOVERY_KEY_MATERIAL_KEYS = Object.keys(recoveryKeySchema.shape);

export async function upsertRecoveryKey(material: RecoveryKeySchema, db: LocalDb): Promise<void> {
  await upsertEntries(Object.entries(recoveryKeySchema.parse(material)), db);
}

export async function getRecoveryKey(db: LocalDb): Promise<RecoveryKeySchema | null> {
  const res = await getEntries(RECOVERY_KEY_MATERIAL_KEYS, db);
  const parsed = recoveryKeySchema.safeParse(res);
  return parsed.success ? parsed.data : null;
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
