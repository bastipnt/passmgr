import { z } from "zod";
import type { LoginRecord } from "./login-record-schema";
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

export type RecordSchema = { schemaVersion: 1 } & LoginRecord;

export type DecryptedRecord = RecordSchema & {
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
