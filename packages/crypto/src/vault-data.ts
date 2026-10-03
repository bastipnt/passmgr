import type { EncryptedVaultMeta, VaultMeta } from "@repo/schema";
import { fromString } from "@repo/util";
import { decryptXChaChaWithAAD, encryptXChaChaWithAAD } from "./util/aead";

/*
 * Data encrypted under a vault key (ADR 0001 D11): records and the vault's own
 * metadata. The AAD binds each ciphertext to where it belongs, so the server
 * can't move a record into another vault, swap two records, or pass one
 * vault's name off as another's. Only identifiers that exist offline go in.
 */

/** Where a record ciphertext belongs. A moved record is re-encrypted, never re-bound. */
export type RecordCipherContext = {
  recordId: string;
  vaultId: string;
  cryptoVersion: number;
};

function recordAad({ recordId, vaultId, cryptoVersion }: RecordCipherContext): Uint8Array {
  return fromString(`passmgr/record/${cryptoVersion}/${vaultId}/${recordId}`);
}

function vaultMetaAad(vaultId: string): Uint8Array {
  return fromString(`passmgr/vault-meta/v1/${vaultId}`);
}

export function encryptRecordData(
  vaultKey: Uint8Array,
  context: RecordCipherContext,
  data: string | Uint8Array,
): [encryptedData: string, nonce: string] {
  return encryptXChaChaWithAAD(vaultKey, data, recordAad(context));
}

/** Throws when the ciphertext belongs to another record / vault, or was tampered with. */
export function decryptRecordData(
  vaultKey: Uint8Array,
  context: RecordCipherContext,
  encryptedData: string,
  nonce: string,
): Uint8Array {
  return decryptXChaChaWithAAD(vaultKey, encryptedData, nonce, recordAad(context));
}

export function encryptVaultMeta(
  vaultKey: Uint8Array,
  vaultId: string,
  meta: VaultMeta,
): EncryptedVaultMeta {
  const [encryptedMeta, metaEncryptionNonce] = encryptXChaChaWithAAD(
    vaultKey,
    JSON.stringify(meta),
    vaultMetaAad(vaultId),
  );
  return { encryptedMeta, metaEncryptionNonce };
}

/**
 * The decrypted metadata JSON, unparsed (the caller validates it). Throws when
 * it belongs to another vault or was tampered with.
 */
export function decryptVaultMeta(
  vaultKey: Uint8Array,
  vaultId: string,
  meta: EncryptedVaultMeta,
): unknown {
  const bytes = decryptXChaChaWithAAD(
    vaultKey,
    meta.encryptedMeta,
    meta.metaEncryptionNonce,
    vaultMetaAad(vaultId),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
