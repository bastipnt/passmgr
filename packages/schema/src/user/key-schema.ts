import z from "zod";

const argonParams = z.object({
  t: z.number().min(3).max(4).multipleOf(1),
  m: z
    .number()
    .min(64 * 1024)
    .max(256 * 1024)
    .multipleOf(64 * 1024),
  p: z.number().min(1).max(4).multipleOf(1),
});

export type ArgonParams = z.infer<typeof argonParams>;

export const recoveryKeySchema = z.object({
  recoveryKekSalt: z.base64().length(44),

  encryptedVaultKeyRecovery: z.base64().length(64),
  vaultKeyEncryptionNonceRecovery: z.base64().length(32),
});

export const passwordKeySchema = z.object({
  passwordKekParams: argonParams,
  passwordKekSalt: z.base64().length(44),

  encryptedVaultKey: z.base64().length(64),
  vaultKeyEncryptionNonce: z.base64().length(32),
});

export const userKeySchema = z.object({
  ...recoveryKeySchema.shape,
  ...passwordKeySchema.shape,
});

export type PasswordKeySchema = z.infer<typeof passwordKeySchema>;
export type UserKeySchema = z.infer<typeof userKeySchema>;

// for client
export const VAULT_KEY = [...Object.keys(passwordKeySchema.shape), "email"];

export type VaultKeyMaterial = PasswordKeySchema & {
  email: string;
};
