import { z } from "zod";
import { canonicalBase64 } from "./base64-schema";
import { CURRENT_SCHEMA_VERSION } from "./record-payload";
import type { RecordData } from "./record-types";
import { argonParamsSchema } from "./user/key-schema";
import { passwordSchema } from "./user/password-schema";
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
 * What reading an export checks per record: where it belongs. The record itself
 * is checked one by one on import (`hasRecordStructure`, a malformed one is
 * skipped), never by field content (`recordDataSchema`): one bad record, or one
 * an edit form would reject (an odd URL, an empty custom field), must not make
 * the whole backup unreadable. Every field is kept as written.
 */
export const exportRecordSchema = z.looseObject({
  id: z.uuid(),
  vaultId: z.uuid(),
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

export const exportKdfSchema = argonParamsSchema.safeExtend({
  algorithm: z.literal("argon2id"),
  salt: canonicalBase64(),
});

/** An encrypted export: `ExportData` as JSON, sealed under a key from the export password. */
export const exportEnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_FORMAT_VERSION),
  encrypted: z.literal(true),
  kdf: exportKdfSchema,
  cipher: z.literal("xchacha20poly1305"),
  nonce: canonicalBase64(),
  data: canonicalBase64(),
});

export type ExportKdf = z.infer<typeof exportKdfSchema>;
export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

const exportMasterPassword = z.string().min(1, "Enter your passmgr password");

/** The export dialog for a plain JSON / CSV export: the password (re-checked). */
export const plainExportFormSchema = z.object({ masterPassword: exportMasterPassword });

export type PlainExportFormValues = z.infer<typeof plainExportFormSchema>;

/** The export dialog for an encrypted backup: the password (re-checked) and the backup's own. */
export const exportPasswordFormSchema = z
  .object({
    masterPassword: exportMasterPassword,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ExportPasswordFormValues = z.infer<typeof exportPasswordFormSchema>;
