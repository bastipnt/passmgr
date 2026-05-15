import { z } from "zod";
import type { LoginRecord } from "./login-record-schema";

export const encryptedRecordSchema = z.object({
  recordId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  clientUpdatedAt: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});

export type EncryptedRecordSchema = z.infer<typeof encryptedRecordSchema>;

export const createRecordInputSchema = z.object({
  recordId: z.uuid(),
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
  version: number;
  clientUpdatedAt: string;
  created_at: string | null;
};

/** The crypto version used when encrypting records with the current code. */
export const CURRENT_CRYPTO_VERSION = 1;

export const syncInputSchema = z.object({
  lastSyncedAt: z.string().optional(),
});

export const syncOutputSchema = z.object({
  records: z.array(encryptedRecordSchema),
  serverTimestamp: z.string(),
});
