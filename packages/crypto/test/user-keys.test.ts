import { fromBase64 } from "@repo/util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptXChaCha } from "../src/encryption";
import {
  deriveRecoveryAuthKey,
  getPasswordKekParams,
  hashRecoveryAuthKey,
  retrievePRK,
  setPasswordKekParams,
} from "../src/hash";
import {
  createVault,
  generateUserKeys,
  rotateVaultKey,
  unwrapAccountKey,
  unwrapAccountKeyWithRecoveryKey,
  unwrapPreviousVaultKey,
  unwrapVaultKey,
  wrapAccountKey,
  wrapPreviousVaultKey,
  wrapVaultKey,
} from "../src/user-keys";
import { genKey } from "../src/util/secrets-utils";
import { decryptVaultMeta } from "../src/vault-data";

const FAST_PARAMS = { t: 1, m: 8, p: 1 };
const PASSWORD = "correct horse battery staple";
const VAULT_ID = "0199a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b";

describe("generateUserKeys", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams(FAST_PARAMS));
  afterAll(() => setPasswordKekParams(previous));

  async function unwrapWithPassword(keys: Awaited<ReturnType<typeof generateUserKeys>>) {
    const kek = await retrievePRK(
      PASSWORD,
      fromBase64(keys.passwordKekSalt),
      keys.passwordKekParams,
    );
    return unwrapAccountKey(kek, keys.encryptedAccountKey, keys.accountKeyEncryptionNonce);
  }

  it("wraps the given account key under the password and the recovery key, without wiping it", async () => {
    const accountKey = genKey();
    const copy = accountKey.slice();

    const keys = await generateUserKeys(PASSWORD, accountKey);

    expect(accountKey).toEqual(copy);
    expect(await unwrapWithPassword(keys)).toEqual(copy);
    expect(await unwrapAccountKeyWithRecoveryKey(keys.recoveryKey, keys)).toEqual(copy);
  });

  it("stores the hash of the recovery auth key as verifier", async () => {
    const keys = await generateUserKeys(PASSWORD, genKey());
    const authKey = await deriveRecoveryAuthKey(keys.recoveryKey);
    expect(fromBase64(keys.recoveryVerifier)).toEqual(await hashRecoveryAuthKey(authKey));
  });

  it("issues a fresh recovery key every time", async () => {
    const accountKey = genKey();
    const a = await generateUserKeys(PASSWORD, accountKey);
    const b = await generateUserKeys(PASSWORD, accountKey);
    expect(a.recoveryKey).not.toEqual(b.recoveryKey);
    expect(a.recoveryVerifier).not.toEqual(b.recoveryVerifier);
  });

  it("throws on a wrong recovery key", async () => {
    const keys = await generateUserKeys(PASSWORD, genKey());
    await expect(unwrapAccountKeyWithRecoveryKey(genKey(), keys)).rejects.toThrow();
  });
});

describe("account key wraps", () => {
  it("round-trip under the same KEK", () => {
    const kek = genKey();
    const accountKey = genKey();
    const [encrypted, nonce] = wrapAccountKey(kek, accountKey);
    expect(unwrapAccountKey(kek, encrypted, nonce)).toEqual(accountKey);
  });

  it("reject a plain (no-AAD) ciphertext of the same key", () => {
    const kek = genKey();
    const [encrypted, nonce] = encryptXChaCha(kek, genKey());
    expect(() => unwrapAccountKey(kek, encrypted, nonce)).toThrow();
  });
});

describe("vault key wraps", () => {
  it("round-trip and carry vaultId + keyVersion", () => {
    const accountKey = genKey();
    const vaultKey = genKey();

    const wrap = wrapVaultKey(accountKey, vaultKey, VAULT_ID, 3);

    expect(wrap).toMatchObject({ vaultId: VAULT_ID, keyVersion: 3 });
    expect(unwrapVaultKey(accountKey, wrap)).toEqual(vaultKey);
  });

  it.each([
    ["another vault", { vaultId: "0199a3c4-0000-7000-8000-000000000000" }],
    ["another key version", { keyVersion: 2 }],
  ])("refuse to open when relabelled as %s", (_label, relabel) => {
    const accountKey = genKey();
    const wrap = wrapVaultKey(accountKey, genKey(), VAULT_ID, 1);

    expect(() => unwrapVaultKey(accountKey, { ...wrap, ...relabel })).toThrow();
  });

  it("refuse a different account key", () => {
    const wrap = wrapVaultKey(genKey(), genKey(), VAULT_ID, 1);
    expect(() => unwrapVaultKey(genKey(), wrap)).toThrow();
  });
});

describe("previous vault keys", () => {
  it("open with the key that replaced them, bound to vault and version", () => {
    const oldKey = genKey();
    const newKey = genKey();
    const link = wrapPreviousVaultKey(newKey, oldKey, VAULT_ID, 4);

    expect(link.keyVersion).toBe(4);
    expect(unwrapPreviousVaultKey(newKey, VAULT_ID, link)).toEqual(oldKey);
    expect(() => unwrapPreviousVaultKey(genKey(), VAULT_ID, link)).toThrow();
    expect(() => unwrapPreviousVaultKey(newKey, VAULT_ID, { ...link, keyVersion: 3 })).toThrow();
    expect(() =>
      unwrapPreviousVaultKey(newKey, "0199a3c4-0000-7000-8000-000000000000", link),
    ).toThrow();
  });

  it("can't pass for a vault-key wrap (separate purpose)", () => {
    const accountKey = genKey();
    const link = wrapPreviousVaultKey(accountKey, genKey(), VAULT_ID, 1);
    expect(() => unwrapVaultKey(accountKey, { ...link, vaultId: VAULT_ID })).toThrow();
  });
});

describe("rotateVaultKey", () => {
  it("wraps a fresh next-version key under the account key, and the current key under it", () => {
    const accountKey = genKey();
    const vault = createVault(accountKey, { name: "Work" });
    const currentKey = unwrapVaultKey(accountKey, vault);

    const rotated = rotateVaultKey(accountKey, currentKey, vault.vaultId, 1, { name: "Work" });

    expect(rotated).toMatchObject({ vaultId: vault.vaultId, keyVersion: 2 });
    const newKey = unwrapVaultKey(accountKey, rotated);
    expect(newKey).not.toEqual(currentKey);
    expect(unwrapPreviousVaultKey(newKey, vault.vaultId, rotated.previousKey)).toEqual(currentKey);
    expect(rotated.previousKey.keyVersion).toBe(1);
    expect(decryptVaultMeta(newKey, vault.vaultId, rotated)).toEqual({ name: "Work" });
  });
});

describe("createVault", () => {
  it("makes a new vault with a random id and a key only the account key opens", () => {
    const accountKey = genKey();

    const a = createVault(accountKey, { name: "A" });
    const b = createVault(accountKey, { name: "B" });

    expect(a.vaultId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.vaultId).not.toBe(b.vaultId);
    expect(a.keyVersion).toBe(1);
    expect(unwrapVaultKey(accountKey, a)).toHaveLength(32);
    expect(unwrapVaultKey(accountKey, a)).not.toEqual(unwrapVaultKey(accountKey, b));
  });

  it("encrypts the metadata with the new vault key, bound to the vault", () => {
    const accountKey = genKey();
    const vault = createVault(accountKey, { name: "Work", color: "blue" });
    const vaultKey = unwrapVaultKey(accountKey, vault);

    expect(decryptVaultMeta(vaultKey, vault.vaultId, vault)).toEqual({
      name: "Work",
      color: "blue",
    });
    expect(() => decryptVaultMeta(vaultKey, crypto.randomUUID(), vault)).toThrow();
  });
});
