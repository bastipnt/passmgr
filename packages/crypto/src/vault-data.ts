import type { EncryptedVaultMeta, TombstoneKind, VaultMeta } from "@repo/schema";
import { fromString } from "@repo/util";
import { decryptXChaChaWithAAD, encryptXChaChaWithAAD } from "./util/aead";

/*
 * Data encrypted under a vault key (ADR 0001 D11): records and the vault's own
 * metadata. The AAD binds each ciphertext to where it belongs, so the server
 * can't move a record into another vault, swap two records, or pass one
 * vault's name off as another's. Only identifiers that exist offline go in.
 */

/**
 * What a record version is (ADR 0001 D11): live content, a tombstone in the
 * trash (`deleted`), the source of a move, or a purge (empty content).
 */
export type RecordState = "live" | "deleted" | "moved" | "purged";

/**
 * A `draft` is a version written on a device and not taken by the server yet:
 * its number is provisional, so it binds only record and vault. A `sealed`
 * version (re-encrypted at the push, ADR 0001 D11) also binds its slot in the
 * record's history, the key version and the state, so the server can't serve
 * an old version as a newer one, turn content into a tombstone or forge a purge.
 */
export type RecordStage = "draft" | "sealed";

/** Where a record ciphertext belongs. A moved record is re-encrypted, never re-bound. */
export type RecordCipherContext = {
  recordId: string;
  vaultId: string;
  cryptoVersion: number;
  stage: RecordStage;
  version: number;
  keyVersion: number;
  state: RecordState;
};

/** The state a stored row's ciphertext is bound to. */
export function recordStateOf(row: {
  deleted_at?: string | null;
  tombstoneKind?: TombstoneKind | null;
}): RecordState {
  if (row.deleted_at == null) return "live";
  return row.tombstoneKind ?? "deleted";
}

/** The context a stored row's ciphertext was encrypted in, at the given stage. */
export function recordCipherContext(
  row: Pick<
    RecordCipherContext,
    "recordId" | "vaultId" | "cryptoVersion" | "version" | "keyVersion"
  > & {
    deleted_at?: string | null;
    tombstoneKind?: TombstoneKind | null;
  },
  stage: RecordStage,
): RecordCipherContext {
  const { recordId, vaultId, cryptoVersion, version, keyVersion } = row;
  return {
    recordId,
    vaultId,
    cryptoVersion,
    stage,
    version,
    keyVersion,
    state: recordStateOf(row),
  };
}

/** How a vault key is looked up: one per vault and key version (a rotation adds one). */
export function vaultKeyId(vaultId: string, keyVersion: number): string {
  return `${vaultId}/${keyVersion}`;
}

function recordAad(context: RecordCipherContext): Uint8Array {
  const { recordId, vaultId, cryptoVersion, stage, version, keyVersion, state } = context;
  const bound = `passmgr/record/${cryptoVersion}/${stage}/${vaultId}/${recordId}`;
  return fromString(stage === "draft" ? bound : `${bound}/${version}/${keyVersion}/${state}`);
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
