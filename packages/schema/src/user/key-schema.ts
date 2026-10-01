import z from "zod";

type ArgonBounds = {
  tMin: number;
  tMax: number;
  mMin: number;
  mMax: number;
  mMultipleOf: number;
  pMin: number;
  pMax: number;
};

const argonBounds: ArgonBounds = {
  tMin: 3,
  tMax: 4,
  mMin: 64 * 1024,
  mMax: 256 * 1024,
  mMultipleOf: 64 * 1024,
  pMin: 1,
  pMax: 4,
};

export function setArgonBounds(partial: Partial<ArgonBounds>): void {
  Object.assign(argonBounds, partial);
}

export function getArgonBounds(): ArgonBounds {
  return { ...argonBounds };
}

const argonParams = z
  .object({
    t: z.number().int(),
    m: z.number().int(),
    p: z.number().int(),
  })
  .superRefine((v, ctx) => {
    if (v.t < argonBounds.tMin || v.t > argonBounds.tMax) {
      ctx.addIssue({
        code: "custom",
        message: `t must be between ${argonBounds.tMin} and ${argonBounds.tMax}`,
        path: ["t"],
      });
    }
    if (v.m < argonBounds.mMin || v.m > argonBounds.mMax || v.m % argonBounds.mMultipleOf !== 0) {
      ctx.addIssue({
        code: "custom",
        message: `m must be in [${argonBounds.mMin}, ${argonBounds.mMax}] and a multiple of ${argonBounds.mMultipleOf}`,
        path: ["m"],
      });
    }
    if (v.p < argonBounds.pMin || v.p > argonBounds.pMax) {
      ctx.addIssue({
        code: "custom",
        message: `p must be between ${argonBounds.pMin} and ${argonBounds.pMax}`,
        path: ["p"],
      });
    }
  });

export type ArgonParams = z.infer<typeof argonParams>;

// Key hierarchy (ADR 0001 D3): the password KEK and the recovery KEK each wrap
// the account key; the account key wraps one key per vault.

// The recovery-key-wrapped copy of the account key (handed back during recovery).
export const recoveryWrapSchema = z.object({
  recoveryKekSalt: z.base64().length(44),

  encryptedAccountKeyRecovery: z.base64().length(64),
  accountKeyEncryptionNonceRecovery: z.base64().length(32),
});

export const recoveryKeySchema = z.object({
  ...recoveryWrapSchema.shape,
  // SHA-256(HKDF(recoveryKey, "recovery-auth")) — lets the server check a
  // recovery request without ever seeing the recovery key.
  recoveryVerifier: z.base64().length(44),
});

export const passwordKeySchema = z.object({
  passwordKekParams: argonParams,
  passwordKekSalt: z.base64().length(44),

  encryptedAccountKey: z.base64().length(64),
  accountKeyEncryptionNonce: z.base64().length(32),
});

export const userKeySchema = z.object({
  ...recoveryKeySchema.shape,
  ...passwordKeySchema.shape,
});

/** A vault key wrapped by the account key; the AAD binds it to vaultId + keyVersion. */
export const vaultKeyWrapSchema = z.object({
  vaultId: z.uuid(),
  keyVersion: z.number().int().positive(),
  encryptedVaultKey: z.base64().length(64),
  vaultKeyEncryptionNonce: z.base64().length(32),
});

export const vaultKindSchema = z.enum(["personal", "shared"]);

/** A vault key the user holds, as handed out at login. */
export const memberVaultKeySchema = z.object({
  ...vaultKeyWrapSchema.shape,
  kind: vaultKindSchema,
});

export type RecoveryWrapSchema = z.infer<typeof recoveryWrapSchema>;
export type PasswordKeySchema = z.infer<typeof passwordKeySchema>;
export type UserKeySchema = z.infer<typeof userKeySchema>;
export type VaultKeyWrap = z.infer<typeof vaultKeyWrapSchema>;
export type VaultKind = z.infer<typeof vaultKindSchema>;
export type MemberVaultKey = z.infer<typeof memberVaultKeySchema>;

// for client: the account key material cached on the device for offline unlock
export const ACCOUNT_KEY_MATERIAL_KEYS = [...Object.keys(passwordKeySchema.shape), "email"];

export type AccountKeyMaterial = PasswordKeySchema & {
  email: string;
};
