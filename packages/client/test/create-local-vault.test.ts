import {
  deriveRecoveryAuthKey,
  getPasswordKekParams,
  hashRecoveryAuthKey,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
  unwrapAccountKeyWithRecoveryKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
} from "@repo/crypto";
import { memberVaultSchema, passwordKeySchema, recoveryKeySchema } from "@repo/schema";
import { fromBase64, toBase64 } from "@repo/util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";

const PASSWORD = "correct horse battery staple";

describe("generateLocalVault", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
  afterAll(() => setPasswordKekParams(previous));

  it("makes a local profile without email or account", async () => {
    const { profile } = await generateLocalVault(PASSWORD);

    expect(profile).toEqual({
      profileId: expect.any(String),
      mode: "local",
      email: null,
      userId: null,
    });
  });

  it("wraps the account key under the password, opening the personal vault and the keypair", async () => {
    const { material, vaults, accountKey } = await generateLocalVault(PASSWORD);
    // (The test Argon2 params are below the production bounds.)
    expect(passwordKeySchema.omit({ passwordKekParams: true }).safeParse(material).success).toBe(
      true,
    );

    const kek = await retrievePRK(
      PASSWORD,
      fromBase64(material.passwordKekSalt),
      material.passwordKekParams,
    );
    const unwrapped = unwrapAccountKey(
      kek,
      material.encryptedAccountKey,
      material.accountKeyEncryptionNonce,
    );
    expect(unwrapped).toEqual(accountKey);

    expect(vaults).toHaveLength(1);
    const [personal] = vaults;
    expect(memberVaultSchema.parse(personal)).toMatchObject({ kind: "personal", role: "owner" });
    expect(unwrapVaultKey(accountKey, personal!)).toHaveLength(32);
    expect(unwrapUserPrivateKey(accountKey, material.userKeyPair)).toHaveLength(32);
  });

  it("wraps the same account key under the recovery key, with a matching verifier", async () => {
    const { recovery, recoveryKey, accountKey } = await generateLocalVault(PASSWORD);
    expect(recoveryKeySchema.safeParse(recovery).success).toBe(true);

    expect(await unwrapAccountKeyWithRecoveryKey(recoveryKey, recovery)).toEqual(accountKey);
    const verifier = await hashRecoveryAuthKey(await deriveRecoveryAuthKey(recoveryKey));
    expect(toBase64(verifier)).toBe(recovery.recoveryVerifier);
  });

  it("never stores the recovery key itself", async () => {
    const created = await generateLocalVault(PASSWORD);
    const stored = JSON.stringify([created.material, created.recovery, created.vaults]);

    expect(stored).not.toContain(toBase64(created.recoveryKey));
    expect(stored).not.toContain(toBase64(created.accountKey));
  });
});
