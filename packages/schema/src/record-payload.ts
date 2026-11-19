import { z } from "zod";
import { MAX_ENCRYPTED_RECORD_LENGTH } from "./record-limits";
import { hasRecordStructure, RECORD_TYPES, type RecordData, type RecordType } from "./record-types";
import { vaultKeyUpdateSchema } from "./sharing-schema";
import { memberVaultSchema } from "./vault-schema";

/**
 * Why a record is gone without being in the trash: `moved` to another vault (a
 * new record there), or `purged` (permanently deleted: the server drops every
 * other version and keeps this one with empty content, so other devices drop
 * theirs too).
 */
export const tombstoneKindSchema = z.enum(["moved", "purged"]);
export type TombstoneKind = z.infer<typeof tombstoneKindSchema>;

/** The record ciphertext format (algorithm and AAD layout, `RecordCipherContext`). */
export const RECORD_CRYPTO_VERSION = 1;

export const encryptedRecordSchema = z.object({
  recordId: z.uuid(),
  vaultId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.int32().positive(),
  // The vault key version the ciphertext is encrypted with (a rotation bumps it).
  keyVersion: z.int32().positive(),
  version: z.int32().positive(),
  clientUpdatedAt: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  // What a tombstone (`deleted_at` set) marks: null a delete (in the trash),
  // `moved` the source of a move, `purged` a record deleted for good.
  tombstoneKind: tombstoneKindSchema.nullable().optional(),
});

export type EncryptedRecordSchema = z.infer<typeof encryptedRecordSchema> & {
  firstCreatedAt?: string;
};

/** The most changes one `record.push` takes; a client splits a longer outbox. */
export const MAX_PUSH_CHANGES = 500;

/** A sealed purge's ciphertext: empty content, only the AEAD tag (base64). */
export const MAX_PURGE_SEAL_LENGTH = 64;

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
 * new ciphertext (restoring a deleted record); `delete` tombstones the record
 * (or purges it, `tombstoneKind`).
 */
/** A pushed version's ciphertext: sealed for the version the change numbers (ADR 0001 D11). */
const sealedCiphertext = {
  encryptedData: z.string().max(MAX_ENCRYPTED_RECORD_LENGTH),
  encryptionNonce: z.string().max(32),
  cryptoVersion: z.literal(RECORD_CRYPTO_VERSION),
  // Must be the vault's current key version: nothing new is written under a rotated-out key.
  keyVersion: z.int32().positive(),
};

export const pushChangeSchema = z.discriminatedUnion("op", [
  z.object({
    ...pushChangeBase,
    ...sealedCiphertext,
    op: z.literal("put"),
    baseVersion: z.int32().nonnegative(),
  }),
  z
    .object({
      ...pushChangeBase,
      // The tombstone's own ciphertext, bound to its kind: the content it keeps,
      // empty for a purge.
      ...sealedCiphertext,
      op: z.literal("delete"),
      baseVersion: z.int32().positive(),
      // A plain delete when absent. `purged` deletes the record's history for good.
      tombstoneKind: tombstoneKindSchema.optional(),
    })
    .refine(
      ({ tombstoneKind, encryptedData }) =>
        tombstoneKind !== "purged" || encryptedData.length <= MAX_PURGE_SEAL_LENGTH,
      { message: "a purge carries no content" },
    ),
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
 * One answer per change, never an error for the whole batch. What each status and reason asks of the
 * client: docs/architecture/vaults-and-sync.md (Vaults and sync).
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
    headVersion: z.int32().nonnegative(),
  }),
  z.object({
    clientChangeId: z.uuid(),
    status: z.literal("rejected"),
    reason: z.enum(["not_found", "forbidden", "key_version", "quota"]),
  }),
]);

export type PushResult = z.infer<typeof pushResultSchema>;

/** One result per change, in the order of the changes. */
export const pushOutputSchema = z.object({ results: z.array(pushResultSchema) });

/** The payload format written by the current code. */
export const CURRENT_SCHEMA_VERSION = 1;

/** The decrypted plaintext of a record: the typed record data plus its format version. */
export type RecordPayload = RecordData & { schemaVersion: typeof CURRENT_SCHEMA_VERSION };

/** The plaintext a record is encrypted as. */
export function recordPayloadJson(data: RecordData): string {
  return JSON.stringify({ ...data, schemaVersion: CURRENT_SCHEMA_VERSION });
}

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

export class InvalidRecordPayloadError extends Error {
  readonly recordType: unknown;

  constructor(recordType: unknown) {
    super(`Malformed ${String(recordType)} record payload`);
    this.name = "InvalidRecordPayloadError";
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
 * The record type and the kind of every field are checked too
 * (`hasRecordStructure`): any vault member with write access can author a
 * payload, and one without a title or with `tags: 5` would break sorting,
 * search and export on every member's device. A rejected record takes the
 * same path as one that fails to decrypt (skipped). Field content (lengths,
 * URLs) is not validated: a record a form would refuse still opens.
 */
export function upgradeRecordPayload(payload: unknown): RecordPayload {
  const { schemaVersion, type } = (payload ?? {}) as { schemaVersion?: unknown; type?: unknown };
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(schemaVersion);
  }
  if (!RECORD_TYPES.includes(type as RecordType)) throw new UnknownRecordTypeError(type);
  if (!hasRecordStructure(payload)) throw new InvalidRecordPayloadError(type);
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

/**
 * A vault's pull cursor: the highest `seq` (the vault's server write order,
 * ADR 0001 D8) the device has pulled from it.
 */
export const syncCursorSchema = z.number().int().nonnegative();

/** The most record versions one `record.sync` page returns. */
export const MAX_SYNC_RECORDS = 500;
/** The smallest page a client may ask for: tiny pages only multiply requests. */
export const MIN_SYNC_RECORDS = 50;

/**
 * Pull changes per vault, one page at a time (`hasMore`: pull again from the
 * returned cursors). A vault without a cursor (new to this device) is sent in
 * full; vaults the user is no longer a member of are ignored.
 */
export const syncInputSchema = z.object({
  cursors: z.record(z.uuid(), syncCursorSchema).default({}),
  limit: z.number().int().min(MIN_SYNC_RECORDS).max(MAX_SYNC_RECORDS).default(MAX_SYNC_RECORDS),
});

export const syncOutputSchema = z.object({
  records: z.array(encryptedRecordSchema),
  // Every vault the user is a member of: the client drops any it isn't in this list.
  vaults: z.array(memberVaultSchema),
  // The next cursor for every vault in `vaults`.
  cursors: z.record(z.string(), syncCursorSchema),
  // The page was full: more changes wait past `cursors`.
  hasMore: z.boolean(),
  // The server's clock at the pull (caps edit times from the future, ADR 0001 D5).
  serverTimestamp: z.string(),
  // Newer keys of the user's vaults, sealed to them after a rotation (ADR 0001 D7).
  keyUpdates: z.array(vaultKeyUpdateSchema),
  // Vaults that lost a member and wait for a key rotation, of those the user manages.
  rotationsDue: z.array(z.uuid()),
});
