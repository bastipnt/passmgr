import z from "zod";
import { emailSchema } from "./email-schema";

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

/** The most key versions a vault can go through (`vault.rotateKey` refuses past it). */
export const MAX_VAULT_KEY_VERSION = 256;

/**
 * A vault's earlier key, wrapped by the key that replaced it (`keyVersion` + 1;
 * AAD: vaultId + keyVersion). A member holding the current key walks these
 * down to the older ones, which the history below a rotation is encrypted with.
 */
export const vaultKeyLinkSchema = z.object({
  keyVersion: z.number().int().positive(),
  encryptedVaultKey: z.base64().length(64),
  vaultKeyEncryptionNonce: z.base64().length(32),
});

/**
 * Every earlier key of a vault at `keyVersion`, oldest first: exactly
 * versions 1 … keyVersion - 1.
 */
export function isCompleteKeyChain(
  keyVersion: number,
  previousKeys: readonly { keyVersion: number }[],
): boolean {
  return (
    previousKeys.length === keyVersion - 1 &&
    previousKeys.every((link, i) => link.keyVersion === i + 1)
  );
}

/**
 * The user's X25519 keypair (ADR 0001 D7). The private key is wrapped by the
 * account key (AAD: key version) and checked against `publicKey` on unwrap.
 */
export const userKeyPairSchema = z.object({
  keyVersion: z.number().int().positive(),
  publicKey: z.base64().length(44),
  encryptedPrivateKey: z.base64().length(64),
  privateKeyEncryptionNonce: z.base64().length(32),
});

/** What other users get to see: the public half, for sealing a vault key to it. */
export const userPublicKeySchema = userKeyPairSchema.pick({ keyVersion: true, publicKey: true });

/** Look up another user's public key (to invite them). */
export const userPublicKeyInputSchema = z.object({ email: emailSchema });

export type RecoveryWrapSchema = z.infer<typeof recoveryWrapSchema>;
export type RecoveryKeySchema = z.infer<typeof recoveryKeySchema>;
export type PasswordKeySchema = z.infer<typeof passwordKeySchema>;
export type UserKeySchema = z.infer<typeof userKeySchema>;
export type VaultKeyWrap = z.infer<typeof vaultKeyWrapSchema>;
export type VaultKeyLink = z.infer<typeof vaultKeyLinkSchema>;
export type UserKeyPair = z.infer<typeof userKeyPairSchema>;
export type UserPublicKey = z.infer<typeof userPublicKeySchema>;

// for client: the account key material cached on the device for unlocking
// without the server. Whose account it is lives in the device profile.
export const ACCOUNT_KEY_MATERIAL_KEYS = [...Object.keys(passwordKeySchema.shape), "userKeyPair"];

export type AccountKeyMaterial = PasswordKeySchema & {
  userKeyPair: UserKeyPair;
};
