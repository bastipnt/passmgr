import { z } from "zod";
import { CURRENT_SCHEMA_VERSION } from "./record-payload";
import { RECORD_TYPES, type RecordData, type RecordType } from "./record-types";
import { vaultKindSchema } from "./vault-schema";

/*
 * The export file (ADR 0001 D12). One plaintext document, `ExportData`, saved
 * either as is (plain JSON, unencrypted) or sealed in an `ExportEnvelope`
 * (encrypted backup: Argon2id over a password the user picks for the file,
 * XChaCha20-Poly1305). Only the current version of every record goes in, no
 * history and no keys: the file opens without the account.
 */

export const EXPORT_FORMAT = "passmgr-export";
export const EXPORT_FORMAT_VERSION = 1;

export const exportVaultSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: vaultKindSchema,
});

/** A record as exported: its content (`RecordData`) plus where it lives and when. */
export type ExportRecord = RecordData & {
  id: string;
  vaultId: string;
  createdAt: string | null;
  updatedAt: string;
};

/**
 * What reading an export checks per record: where it belongs and its type.
 * Deliberately not the record fields (`recordDataSchema`): records aren't
 * validated field by field when written (`upgradeRecordPayload`), so the vault
 * may hold one an edit form would reject (an odd URL, an empty custom field).
 * One such record must not make the whole backup unreadable. Every field is
 * kept as written.
 */
export const exportRecordSchema = z.looseObject({
  id: z.uuid(),
  vaultId: z.uuid(),
  type: z.string().refine((type) => RECORD_TYPES.includes(type as RecordType), {
    message: "Unknown record type",
  }),
  title: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const exportDataSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.string(),
  /** The record payload format (`CURRENT_SCHEMA_VERSION`) the records are in. */
  recordSchemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  vaults: z.array(exportVaultSchema),
  records: z.array(exportRecordSchema),
});

export type ExportVault = z.infer<typeof exportVaultSchema>;
export type ExportData = Omit<z.infer<typeof exportDataSchema>, "records"> & {
  records: ExportRecord[];
};

export const exportKdfSchema = z.object({
  algorithm: z.literal("argon2id"),
  salt: z.base64(),
  t: z.number().int().positive(),
  m: z.number().int().positive(),
  p: z.number().int().positive(),
});

/** An encrypted export: `ExportData` as JSON, sealed under a key from the export password. */
export const exportEnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_FORMAT_VERSION),
  encrypted: z.literal(true),
  kdf: exportKdfSchema,
  cipher: z.literal("xchacha20poly1305"),
  nonce: z.base64(),
  data: z.base64(),
});

export type ExportKdf = z.infer<typeof exportKdfSchema>;
export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

/** The export dialog for an encrypted backup: the master password (re-checked) and the backup's own. */
export const exportPasswordFormSchema = z
  .object({
    masterPassword: z.string().min(1, "Enter your master password"),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ExportPasswordFormValues = z.infer<typeof exportPasswordFormSchema>;
