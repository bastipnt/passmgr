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

/** The most changes one `record.push` takes; a client splits a longer outbox. */
export const MAX_PUSH_CHANGES = 500;

const pushChangeBase = {
  // Client-generated, unique per record: a retry returns the version it stored (ADR 0001 D5).
  clientChangeId: z.uuid(),
  recordId: z.uuid(),
  // The record's vault; the server checks the user may write to it.
  vaultId: z.uuid(),
  clientUpdatedAt: z.iso.datetime({ offset: true }),
};

/**
 * One local change to push (ADR 0001 D5/D8): compare-and-swap on `baseVersion`,
 * the server version the change builds on (0: a new record). `put` writes the
 * new ciphertext (restoring a deleted record); `delete` tombstones the record.
 */
export const pushChangeSchema = z.discriminatedUnion("op", [
  z.object({
    ...pushChangeBase,
    op: z.literal("put"),
    baseVersion: z.number().int().nonnegative(),
    encryptedData: z.string(),
    encryptionNonce: z.string(),
    cryptoVersion: z.number().int().positive(),
  }),
  z.object({
    ...pushChangeBase,
    op: z.literal("delete"),
    baseVersion: z.number().int().positive(),
  }),
]);

export type PushChange = z.infer<typeof pushChangeSchema>;

/**
 * Changes in write order. A record's changes form a chain, applied all or
 * nothing: when one can't be, none of the record's changes in the batch are.
 */
export const pushInputSchema = z.object({
  changes: z
    .array(pushChangeSchema)
    .min(1)
    .max(MAX_PUSH_CHANGES)
    // Results are matched by id, and a change sent twice would be written twice.
    .refine((changes) => new Set(changes.map((c) => c.clientChangeId)).size === changes.length, {
      message: "clientChangeId must be unique within a batch",
    }),
});

/**
 * The answer for one change, never an error for the whole batch:
 * - `applied`: the server holds it (now, or from an earlier try); `record` is its copy.
 * - `stale`: the record moved on (`headVersion`); pull, merge and push again.
 * - `rejected`: it can never apply as sent (no write access, unknown record).
 */
export const pushResultSchema = z.discriminatedUnion("status", [
  z.object({
    clientChangeId: z.uuid(),
    status: z.literal("applied"),
    record: encryptedRecordSchema,
  }),
  z.object({
    clientChangeId: z.uuid(),
    status: z.literal("stale"),
    headVersion: z.number().int().nonnegative(),
  }),
  z.object({
    clientChangeId: z.uuid(),
    status: z.literal("rejected"),
    reason: z.enum(["not_found", "forbidden"]),
  }),
]);

export type PushResult = z.infer<typeof pushResultSchema>;

/** One result per change, in the order of the changes. */
export const pushOutputSchema = z.object({ results: z.array(pushResultSchema) });

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
 * A vault's pull cursor: the highest `seq` (the vault's server write order,
 * ADR 0001 D8) the device has pulled from it.
 */
export const syncCursorSchema = z.number().int().nonnegative();

/**
 * Pull changes per vault. A vault without a cursor (new to this device) is sent
 * in full; vaults the user is no longer a member of are ignored.
 */
export const syncInputSchema = z.object({
  cursors: z.record(z.uuid(), syncCursorSchema).default({}),
});

export const syncOutputSchema = z.object({
  records: z.array(encryptedRecordSchema),
  // Every vault the user is a member of: the client drops any it isn't in this list.
  vaults: z.array(memberVaultSchema),
  // The next cursor for every vault in `vaults`.
  cursors: z.record(z.string(), syncCursorSchema),
  // The server's clock at the pull (caps edit times from the future, ADR 0001 D5).
  serverTimestamp: z.string(),
});
