import { VAULT_KEY, type VaultKeyMaterial } from "@repo/schema";
import { BIOMETRIC_KEY, type BiometricKeyMaterial } from "@repo/crypto";
import type { SqlDriver } from "../driver";

export const CREATE_KEYS_SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS key_material (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export async function clearKeysTable(db: SqlDriver) {
  await db.run(`DELETE FROM key_material`);
}

/**
 * VAULT KEYS
 */

export async function upsertVaultKey(vaultKey: VaultKeyMaterial, db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    for (let [key, value] of Object.entries(vaultKey)) {
      if (key === "passwordKekParams") value = JSON.stringify(value);
      await tx.run(/* sql */ `INSERT OR REPLACE INTO key_material (key, value) VALUES (?, ?)`, [
        key,
        value,
      ]);
    }
  });
}

export async function getVaultKey(db: SqlDriver): Promise<VaultKeyMaterial | null> {
  const allRows = await db.all<{ key: string; value: string }>(/* sql */ `
    SELECT key, value FROM key_material
  `);
  const rows = allRows.filter((r) => VAULT_KEY.includes(r.key));
  if (rows.length < VAULT_KEY.length) return null;
  const res = Object.fromEntries(rows.map((r) => [r.key, r.value]));

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
  db: SqlDriver,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(biometricKey)) {
      await tx.run(/* sql */ `INSERT OR REPLACE INTO key_material (key, value) VALUES (?, ?)`, [
        key,
        value,
      ]);
    }
  });
}

export async function getBiometricKey(db: SqlDriver): Promise<BiometricKeyMaterial | null> {
  const allRows = await db.all<{ key: string; value: string }>(/* sql */ `
    SELECT key, value FROM key_material
  `);
  const rows = allRows.filter((r) => (BIOMETRIC_KEY as readonly string[]).includes(r.key));
  if (rows.length < BIOMETRIC_KEY.length) return null;
  const res = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return res as BiometricKeyMaterial;
}

export async function clearBiometricKey(db: SqlDriver): Promise<void> {
  await db.transaction(async (tx) => {
    for (const key of BIOMETRIC_KEY) {
      await tx.run(`DELETE FROM key_material WHERE key = ?`, [key]);
    }
  });
}
