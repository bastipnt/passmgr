import z from "zod";
import { vaultKeyWrapSchema } from "./user/key-schema";

// Vaults (ADR 0001 D6). The server sees ids, kind, roles and key versions;
// everything a user would recognise a vault by is in the encrypted metadata.

/** `personal` is the default vault every account has exactly one of. */
export const vaultKindSchema = z.enum(["personal", "shared"]);

/** `owner` > `manage` (invite / remove, edit metadata) > `write` > `read`. */
export const vaultRoleSchema = z.enum(["owner", "manage", "write", "read"]);

export const VAULT_WRITE_ROLES = ["owner", "manage", "write"] as const;
export const VAULT_MANAGE_ROLES = ["owner", "manage"] as const;

/** The decrypted vault metadata. */
export const vaultMetaSchema = z.object({
  name: z.string().trim().min(1).max(64),
  icon: z.string().max(32).optional(),
  color: z.string().max(32).optional(),
});

/** Vault metadata encrypted with the vault key (AAD: vaultId). */
export const encryptedVaultMetaSchema = z.object({
  encryptedMeta: z.base64().max(2048),
  metaEncryptionNonce: z.base64().length(32),
});

/** A vault the user is a member of: their wrap of its key, their role and its metadata. */
export const memberVaultSchema = z.object({
  ...vaultKeyWrapSchema.shape,
  ...encryptedVaultMetaSchema.shape,
  kind: vaultKindSchema,
  role: vaultRoleSchema,
});

/** A new (non-default) vault, created on the client: id, key wrap and metadata. */
export const createVaultInputSchema = z.object({
  ...vaultKeyWrapSchema.shape,
  ...encryptedVaultMetaSchema.shape,
  keyVersion: z.literal(1),
});

export const updateVaultMetaInputSchema = z.object({
  vaultId: z.uuid(),
  ...encryptedVaultMetaSchema.shape,
});

/** Delete a vault: owners only, never the personal one. */
export const deleteVaultInputSchema = z.object({ vaultId: z.uuid() });

/** Whether a member with this role may write records into the vault. */
export function canWriteVault(role: VaultRole): boolean {
  return (VAULT_WRITE_ROLES as readonly VaultRole[]).includes(role);
}

/** Whether a member with this role may rename the vault (and, later, invite). */
export function canManageVault(role: VaultRole): boolean {
  return (VAULT_MANAGE_ROLES as readonly VaultRole[]).includes(role);
}

export type VaultKind = z.infer<typeof vaultKindSchema>;
export type VaultRole = z.infer<typeof vaultRoleSchema>;
export type VaultMeta = z.infer<typeof vaultMetaSchema>;
export type EncryptedVaultMeta = z.infer<typeof encryptedVaultMetaSchema>;
export type MemberVault = z.infer<typeof memberVaultSchema>;
