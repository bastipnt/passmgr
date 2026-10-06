import { z } from "zod";
import { RECORD_TYPES, type RecordData, type RecordType } from "./record-types";
import { memberVaultSchema } from "./vault-schema";

export const encryptedRecordSchema = z.object({
  recordId: z.uuid(),
  vaultId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  clientUpdatedAt: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});

export type EncryptedRecordSchema = z.infer<typeof encryptedRecordSchema> & {
  firstCreatedAt?: string;
};

export const createRecordInputSchema = z.object({
  recordId: z.uuid(),
  vaultId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive().default(1),
  clientUpdatedAt: z.string(),
});

export const updateRecordInputSchema = z.object({
  recordId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  clientUpdatedAt: z.string(),
});

/**
 * A record to tombstone: its id, or its id and the version the client last
 * saw (compare-and-swap, as for an update).
 */
export const deleteRecordInputSchema = z.union([
  z.uuid(),
  z.object({ recordId: z.uuid(), version: z.number().int().positive() }),
]);

/** The payload format written by the current code. */
export const CURRENT_SCHEMA_VERSION = 1;

/** The decrypted plaintext of a record: the typed record data plus its format version. */
export type RecordPayload = RecordData & { schemaVersion: typeof CURRENT_SCHEMA_VERSION };

export class UnsupportedSchemaVersionError extends Error {
  readonly schemaVersion: unknown;

  constructor(schemaVersion: unknown) {
    super(`Unsupported record schema version: ${String(schemaVersion)}`);
    this.name = "UnsupportedSchemaVersionError";
    this.schemaVersion = schemaVersion;
  }
}

export class UnknownRecordTypeError extends Error {
  readonly recordType: unknown;

  constructor(recordType: unknown) {
    super(`Unknown record type: ${String(recordType)}`);
    this.name = "UnknownRecordTypeError";
    this.recordType = recordType;
  }
}

/**
 * Bring a freshly decrypted payload up to the current format (ADR 0001 D4).
 * Upgrades run lazily on the client: in memory on decrypt, written back in the
 * new format on the next edit. Version 1 is the first typed format, so there
 * is nothing to upgrade yet. A payload from a newer client is rejected rather
 * than shown half-understood, where an edit would drop its unknown fields.
 *
 * The record type is checked too: everything that renders a record switches
 * on it, and any vault member with write access can author a payload. A
 * rejected record takes the same path as one that fails to decrypt (skipped).
 * Fields are not validated here; that would cost a schema parse per record.
 */
export function upgradeRecordPayload(payload: unknown): RecordPayload {
  const { schemaVersion, type } = (payload ?? {}) as { schemaVersion?: unknown; type?: unknown };
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(schemaVersion);
  }
  if (!RECORD_TYPES.includes(type as RecordType)) throw new UnknownRecordTypeError(type);
  return payload as RecordPayload;
}

export type DecryptedRecord = RecordPayload & {
  recordId: string;
  vaultId: string;
  version: number;
  clientUpdatedAt: string;
  created_at: string | null;
  firstCreatedAt: string | null;
};

/** The crypto version used when encrypting records with the current code. */
export const CURRENT_CRYPTO_VERSION = 1;

/**
 * Move a record to another vault (ADR 0001 D6): the client re-encrypts it under
 * the target vault's key as a new record; the source record is tombstoned and
 * keeps its history.
 */
export const moveRecordInputSchema = z.object({
  recordId: z.uuid(),
  // The source version the client re-encrypted; a newer one makes the move stale.
  version: z.number().int().positive(),
  target: createRecordInputSchema,
});

/**
 * Pull changes per vault. A vault without a cursor (new to this device) is sent
 * in full; vaults the user is no longer a member of are ignored.
 */
export const syncInputSchema = z.object({
  cursors: z.record(z.uuid(), z.iso.datetime()).default({}),
});

export const syncOutputSchema = z.object({
  records: z.array(encryptedRecordSchema),
  // Every vault the user is a member of: the client drops any it isn't in this list.
  vaults: z.array(memberVaultSchema),
  // The cursor for every vault in `vaults`.
  serverTimestamp: z.string(),
});
