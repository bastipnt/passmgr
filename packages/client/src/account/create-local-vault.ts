import type { AccountKeyMaterial, MemberVault, RecoveryKeySchema } from "@repo/schema";
import type { LocalProfile } from "@repo/store";
import { generateKeyring } from "./new-keyring";

/** Everything a vault that lives on this device only is made of (ADR 0001 D2). */
export type NewLocalVault = {
  profile: Extract<LocalProfile, { mode: "local" }>;
  /** The password wrap of the account key + the keypair: what an unlock needs. */
  material: AccountKeyMaterial;
  /** The recovery wrap + verifier: kept on the device for local recovery and for linking. */
  recovery: RecoveryKeySchema;
  vaults: MemberVault[];
  /** Plaintext: the caller wipes both. The recovery key is shown once, never sent anywhere. */
  accountKey: Uint8Array;
  recoveryKey: Uint8Array;
};

/**
 * Generate a local vault on the device, without a server: the same keyring a
 * registration creates (so linking it to an account later reuses it as is),
 * and a `local` profile that needs no email.
 */
export async function generateLocalVault(password: string): Promise<NewLocalVault> {
  const { accountKey, recoveryKey, userKeys, personalVault, userKeyPair } =
    await generateKeyring(password);
  const {
    recoveryKekSalt,
    recoveryVerifier,
    encryptedAccountKeyRecovery,
    accountKeyEncryptionNonceRecovery,
    ...passwordWrap
  } = userKeys;

  return {
    profile: { profileId: crypto.randomUUID(), mode: "local", email: null, userId: null },
    material: { ...passwordWrap, userKeyPair },
    recovery: {
      recoveryKekSalt,
      recoveryVerifier,
      encryptedAccountKeyRecovery,
      accountKeyEncryptionNonceRecovery,
    },
    vaults: [{ ...personalVault, kind: "personal", role: "owner" }],
    accountKey,
    recoveryKey,
  };
}
