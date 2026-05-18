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
