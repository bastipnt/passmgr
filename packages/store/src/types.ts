import type { BiometricKeyMaterial } from "@repo/crypto";

export type LocalItem = {
  itemId: string;
  encryptedData: string;
  encryptionNonce: string;
  cryptoVersion: number;
  version: number;
  clientUpdatedAt: string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type VaultKeyMaterial = {
  encryptedVaultKey: string;
  vaultKeyEncryptionNonce: string;
  passwordKekSalt: string;
  passwordKekParams: string; // JSON-encoded {t, m, p}
  email: string;
};

export interface StorageAdapter {
  /** Insert or replace item rows (by itemId + version). */
  upsertItems(items: LocalItem[]): Promise<void>;

  /** Get latest version per itemId, excluding soft-deleted. */
  getAllLatest(): Promise<LocalItem[]>;

  /** Get latest version of a single item (even if deleted). */
  getByItemId(itemId: string): Promise<LocalItem | undefined>;

  /** Sync metadata */
  getLastSyncTimestamp(): Promise<string | null>;
  setLastSyncTimestamp(ts: string): Promise<void>;

  /** Persist encrypted vault key material for offline unlock. */
  setVaultKeyMaterial(material: VaultKeyMaterial): Promise<void>;

  /** Retrieve stored vault key material, or null if not set. */
  getVaultKeyMaterial(): Promise<VaultKeyMaterial | null>;

  /** Persist biometric key material for WebAuthn PRF unlock. */
  setBiometricKeyMaterial(material: BiometricKeyMaterial): Promise<void>;

  /** Retrieve stored biometric key material, or null if not enrolled. */
  getBiometricKeyMaterial(): Promise<BiometricKeyMaterial | null>;

  /** Clear biometric key material (on disenroll or logout). */
  clearBiometricKeyMaterial(): Promise<void>;

  /** Clear all data (on logout). */
  clear(): Promise<void>;
}
