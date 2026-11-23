import { fromBase64 } from "@repo/util";
import { describe, expect, it, vi } from "vitest";
import { type DeriveArgon2, retrievePRK } from "../src/hash";
import { createKeyring } from "../src/keyring";
import { unwrapUserPrivateKey } from "../src/user-key-pair";
import {
  unwrapAccountKey,
  unwrapAccountKeyWithRecoveryKey,
  unwrapVaultKey,
} from "../src/user-keys";
import { decryptVaultMeta } from "../src/vault-data";

const FAST_PARAMS = { t: 1, m: 8, p: 1 };
const PASSWORD = "correct horse battery staple";

describe("createKeyring", () => {
  it("wraps one account key under password and recovery key, plus vault and keypair", async () => {
    const { accountKey, recoveryKey, userKeys, personalVault, userKeyPair } = await createKeyring(
      PASSWORD,
      FAST_PARAMS,
    );

    expect(userKeys.passwordKekParams).toEqual(FAST_PARAMS);
    const kek = await retrievePRK(PASSWORD, fromBase64(userKeys.passwordKekSalt), FAST_PARAMS);
    expect(
      unwrapAccountKey(kek, userKeys.encryptedAccountKey, userKeys.accountKeyEncryptionNonce),
    ).toEqual(accountKey);
    expect(await unwrapAccountKeyWithRecoveryKey(recoveryKey, userKeys)).toEqual(accountKey);
    const vaultKey = unwrapVaultKey(accountKey, personalVault);
    expect(decryptVaultMeta(vaultKey, personalVault.vaultId, personalVault)).toEqual({
      name: "Personal",
    });
    expect(() => unwrapUserPrivateKey(accountKey, userKeyPair)).not.toThrow();
  });

  it("derives through the given function", async () => {
    const derive = vi.fn<DeriveArgon2>(retrievePRK);
    await createKeyring(PASSWORD, FAST_PARAMS, derive);
    expect(derive).toHaveBeenCalledTimes(1);
  });
});
