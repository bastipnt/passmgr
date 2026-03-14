import { z } from "zod";
import type { LoginItem } from "./login-item";

export const encryptedItemSchema = z.object({
  itemId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  clientUpdatedAt: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});

export type EncryptedItemSchema = z.infer<typeof encryptedItemSchema>;

export const createItemInputSchema = z.object({
  itemId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive().default(1),
  clientUpdatedAt: z.string(),
});

export const updateItemInputSchema = z.object({
  itemId: z.uuid(),
  encryptedData: z.string(),
  encryptionNonce: z.string(),
  cryptoVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  clientUpdatedAt: z.string(),
});

export type ItemSchema = { schemaVersion: 1 } & LoginItem;

/** The crypto version used when encrypting items with the current code. */
export const CURRENT_CRYPTO_VERSION = 1;

export const syncInputSchema = z.object({
  lastSyncedAt: z.string().optional(),
});

export const syncOutputSchema = z.object({
  items: z.array(encryptedItemSchema),
  serverTimestamp: z.string(),
});
