import {
  createUserKeyPair,
  genKey,
  hkdf,
  unwrapAccountKey,
  verifyHmac,
  wrapAccountKey,
  wrapVaultKey,
} from "@repo/crypto";
import type { MemberVaultKey } from "@repo/schema";
import { fromString } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { secretsStore } from "./secrets-store";

const PERSONAL_ID = "0199a3c4-0000-7000-8000-00000000000a";
const WORK_ID = "0199a3c4-0000-7000-8000-00000000000b";

/** Fresh account + vault keys and their wraps, as the server would hand them out. */
function keyring() {
  const accountKey = genKey();
  const personalKey = genKey();
  const workKey = genKey();
  const wraps: MemberVaultKey[] = [
    { ...wrapVaultKey(accountKey, personalKey, PERSONAL_ID, 1), kind: "personal" },
    { ...wrapVaultKey(accountKey, workKey, WORK_ID, 1), kind: "shared" },
  ];
  return { accountKey, personalKey, workKey, wraps };
}

/** Unlock the store with a fresh keyring (biometric-style: account key set directly). */
function unlockWithKeyring() {
  const ring = keyring();
  secretsStore.unlockWithAccountKey(ring.accountKey.slice());
  secretsStore.loadVaultKeys(ring.wraps);
  return ring;
}

beforeEach(() => {
  secretsStore.lock();
});

describe("unlockSession", () => {
  it("derives sessionSecret and authKey from sessionKey + authSalt (matches independent HKDF)", async () => {
    const sessionKey = "deadbeef-session-key";
    const authSalt = genKey();

    await secretsStore.unlockSession("sid-1", sessionKey, authSalt);

    // Independent derivation: the store must use the same hkdf chain.
    const expectedSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    const expectedAuthKey = await hkdf(expectedSecret, "sessionAuth", authSalt);

    // signRequest uses authKey for HMAC — verify with the independently-derived authKey.
    const signature = await secretsStore.signRequest("hello world");
    expect(await verifyHmac(expectedAuthKey, signature, "hello world")).toBe(true);
  });

  it("stores sessionId on the store", async () => {
    await secretsStore.unlockSession("sid-42", "k", genKey());
    expect(secretsStore.sessionId).toBe("sid-42");
  });
});

describe("unlockAccount", () => {
  it("unwraps the account key and wipes the passwordKek buffer", () => {
    const passwordKek = genKey();
    const { accountKey, wraps } = keyring();
    const [encrypted, nonce] = wrapAccountKey(passwordKek, accountKey);
    const kekCopy = passwordKek.slice();

    secretsStore.unlockAccount(kekCopy, encrypted, nonce);
    secretsStore.loadVaultKeys(wraps);

    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(Array.from(kekCopy).every((b) => b === 0)).toBe(true);
    expect(secretsStore.exportAccountKey()).toEqual(accountKey);
  });

  it("throws when the passwordKek is tampered (single byte flip), and wipes it anyway", () => {
    const passwordKek = genKey();
    const [encrypted, nonce] = wrapAccountKey(passwordKek, genKey());
    const tampered = passwordKek.slice();
    tampered[0] = tampered[0]! ^ 0x01;

    expect(() => secretsStore.unlockAccount(tampered, encrypted, nonce)).toThrow();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(tampered.every((b) => b === 0)).toBe(true);
  });
});

describe("replacing the account key", () => {
  it("wipes the previous account key buffer", () => {
    const first = genKey();
    secretsStore.unlockWithAccountKey(first);

    secretsStore.unlockWithAccountKey(genKey());

    expect(first.every((b) => b === 0)).toBe(true);
  });

  it("keeps the buffer when the same one is set again", () => {
    const key = genKey();
    const copy = key.slice();
    secretsStore.unlockWithAccountKey(key);

    secretsStore.unlockWithAccountKey(key);

    expect(key).toEqual(copy);
  });

  it("restoreSession leaves the store untouched when the bundle is malformed", async () => {
    await secretsStore.unlockSession("sid-live", "k", genKey());
    const { accountKey } = unlockWithKeyring();

    // A bundle persisted before the account key existed has no accountKeyB64.
    const legacy = {
      sessionId: "sid-old",
      authKeyB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      authSaltB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    } as unknown as Parameters<typeof secretsStore.restoreSession>[0];

    expect(() => secretsStore.restoreSession(legacy)).toThrow();
    expect(secretsStore.sessionId).toBe("sid-live");
    expect(secretsStore.exportAccountKey()).toEqual(accountKey);
  });
});

describe("loadUserKeyPair", () => {
  it("needs the account key first", () => {
    expect(() => secretsStore.loadUserKeyPair(createUserKeyPair(genKey()))).toThrow(
      /SessionLocked/,
    );
  });

  it("holds the private key and exposes the public key it proves", () => {
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);
    secretsStore.unlockWithAccountKey(accountKey);

    secretsStore.loadUserKeyPair(keyPair);

    expect(secretsStore.userPublicKey).toBe(keyPair.publicKey);
    expect(secretsStore._peekBuffers().userPrivateKey).toHaveLength(32);
  });

  it("rejects a keypair whose public key was swapped, and keeps nothing", () => {
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadUserKeyPair(keyPair);
    const before = secretsStore._peekBuffers().userPrivateKey!;

    const swapped = { ...keyPair, publicKey: createUserKeyPair(genKey()).publicKey };
    expect(() => secretsStore.loadUserKeyPair(swapped)).toThrow("doesn't match");

    expect(secretsStore.userPublicKey).toBeUndefined();
    expect(secretsStore._peekBuffers().userPrivateKey).toBeUndefined();
    expect(before.every((b) => b === 0)).toBe(true);
  });

  it("rejects a keypair wrapped under another account key", () => {
    secretsStore.unlockWithAccountKey(genKey());
    expect(() => secretsStore.loadUserKeyPair(createUserKeyPair(genKey()))).toThrow();
    expect(secretsStore.userPublicKey).toBeUndefined();
  });

  it("lockVault wipes the private key", () => {
    const accountKey = genKey();
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadUserKeyPair(createUserKeyPair(accountKey));
    const privateKey = secretsStore._peekBuffers().userPrivateKey!;

    secretsStore.lockVault();

    expect(privateKey.every((b) => b === 0)).toBe(true);
    expect(secretsStore.userPublicKey).toBeUndefined();
  });
});

describe("loadVaultKeys", () => {
  it("needs the account key first", () => {
    expect(() => secretsStore.loadVaultKeys(keyring().wraps)).toThrow(/SessionLocked/);
  });

  it("the vault counts as unlocked only once the vault keys are loaded", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);
    expect(secretsStore.isVaultUnlocked).toBe(false);

    secretsStore.loadVaultKeys(wraps);

    expect(secretsStore.isVaultUnlocked).toBe(true);
  });

  it("refuses a wrap made under another account key and keeps nothing", () => {
    const { accountKey, wraps } = keyring();
    const foreign = { ...wrapVaultKey(genKey(), genKey(), WORK_ID, 1), kind: "shared" as const };
    secretsStore.unlockWithAccountKey(accountKey);

    expect(() => secretsStore.loadVaultKeys([wraps[0]!, foreign])).toThrow();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore._peekBuffers().vaultKeys).toEqual([]);
  });

  it("refuses a key list without a personal vault", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);

    expect(() => secretsStore.loadVaultKeys([wraps[1]!])).toThrow(/personal vault/);
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("rejects a key list that names a vault twice and keeps nothing", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);

    expect(() => secretsStore.loadVaultKeys([...wraps, wraps[0]!])).toThrow(/Duplicate vault/);
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore._peekBuffers().vaultKeys).toEqual([]);
  });

  it("wipes the previously loaded vault keys when replacing them", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(wraps);
    const before = secretsStore._peekBuffers().vaultKeys;

    secretsStore.loadVaultKeys(wraps);

    expect(before.every((key) => key.every((b) => b === 0))).toBe(true);
    expect(secretsStore.isVaultUnlocked).toBe(true);
  });
});

describe("signRequest", () => {
  it("throws when the session is not unlocked", async () => {
    await expect(secretsStore.signRequest("any")).rejects.toThrow(/SessionLocked/);
  });

  it("produces a HMAC that verifies against the derived authKey", async () => {
    const sessionKey = "another-session-key";
    const authSalt = genKey();
    await secretsStore.unlockSession("sid", sessionKey, authSalt);

    const message = "mutation\n/record.create\n123\n{}";
    const sig = await secretsStore.signRequest(message);

    const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    const authKey = await hkdf(sessionSecret, "sessionAuth", authSalt);
    expect(await verifyHmac(authKey, sig, message)).toBe(true);
  });
});

describe("encryptRecord / decryptRecord", () => {
  it("throws when the vault is locked", () => {
    expect(() => secretsStore.encryptRecord("data")).toThrow(/SessionLocked/);
    expect(() => secretsStore.decryptRecord("x", "y")).toThrow(/SessionLocked/);
  });

  it("round-trips with the personal vault key", () => {
    unlockWithKeyring();

    const [enc, nonce] = secretsStore.encryptRecord("hello");

    expect(new TextDecoder().decode(secretsStore.decryptRecord(enc, nonce))).toBe("hello");
  });

  it("encrypts under the personal vault key, not the account key or another vault's", () => {
    const { personalKey } = unlockWithKeyring();

    expect(secretsStore.exportVaultKeyForWorker()).toEqual(personalKey);
  });

  it("biometric unlock does not enable signRequest (no authKey)", async () => {
    unlockWithKeyring();
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);
  });
});

describe("lock", () => {
  it("clears sessionId and disables signing + record decryption", async () => {
    await secretsStore.unlockSession("sid", "k", genKey());
    unlockWithKeyring();

    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(secretsStore.sessionId).toBe("sid");

    secretsStore.lock();

    expect(secretsStore.sessionId).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);
    expect(() => secretsStore.encryptRecord("x")).toThrow(/SessionLocked/);
  });

  it("wipes every internal buffer (session keys, account key, vault keys)", async () => {
    const authSalt = genKey();
    const { accountKey, wraps } = keyring();

    await secretsStore.unlockSession("sid", "session-key", authSalt);
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(wraps);

    // Grab live references to every internal buffer before lock().
    const internal = secretsStore._peekBuffers();
    expect(internal.sessionSecret).toBeDefined();
    expect(internal.authKey).toBeDefined();
    expect(internal.authSalt).toBeDefined();
    expect(internal.accountKey).toBeDefined();
    expect(internal.vaultKeys).toHaveLength(2);

    secretsStore.lock();

    // Every internal buffer must be zeroed in place.
    const zeroed = (buf: Uint8Array) => buf.every((b) => b === 0);
    expect(zeroed(internal.sessionSecret!)).toBe(true);
    expect(zeroed(internal.authKey!)).toBe(true);
    expect(zeroed(internal.authSalt!)).toBe(true);
    expect(zeroed(internal.accountKey!)).toBe(true);
    expect(internal.vaultKeys.every(zeroed)).toBe(true);

    // The input buffers we still hold references to are the same memory and
    // are therefore zeroed too.
    expect(zeroed(authSalt)).toBe(true);
    expect(zeroed(accountKey)).toBe(true);
  });

  it("lockVault wipes the account and vault keys but keeps the session", async () => {
    await secretsStore.unlockSession("sid", "k", genKey());
    unlockWithKeyring();
    const internal = secretsStore._peekBuffers();

    secretsStore.lockVault();

    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(internal.accountKey!.every((b) => b === 0)).toBe(true);
    expect(internal.vaultKeys.every((key) => key.every((b) => b === 0))).toBe(true);
    expect(secretsStore.sessionId).toBe("sid");
    await expect(secretsStore.signRequest("x")).resolves.toBeDefined();
  });

  it("is idempotent (calling lock twice does not throw)", () => {
    expect(() => {
      secretsStore.lock();
      secretsStore.lock();
    }).not.toThrow();
  });
});

describe("password helpers (biometric enrollment)", () => {
  it("set/get/clearPassword work", () => {
    expect(secretsStore.getPassword()).toBeUndefined();
    secretsStore.setPassword("pw");
    expect(secretsStore.getPassword()).toBe("pw");
    secretsStore.clearPassword();
    expect(secretsStore.getPassword()).toBeUndefined();
  });

  it("lock() clears the temporary password", () => {
    secretsStore.setPassword("pw");
    secretsStore.lock();
    expect(secretsStore.getPassword()).toBeUndefined();
  });
});

describe("exportPersistableBundle / restoreSession", () => {
  it("throws unless both the session and vault are unlocked", async () => {
    expect(() => secretsStore.exportPersistableBundle()).toThrow(/SessionLocked/);

    // session unlocked but vault still locked
    await secretsStore.unlockSession("sid", "k", genKey());
    expect(() => secretsStore.exportPersistableBundle()).toThrow(/SessionLocked/);
  });

  it("round-trips: a restored store signs and, after reloading vault keys, decrypts (no OPAQUE/Argon2)", async () => {
    const sessionKey = "persist-session-key";
    const authSalt = genKey();
    const authSaltCopy = authSalt.slice(); // lock() will zero the stored authSalt

    await secretsStore.unlockSession("sid-persist", sessionKey, authSalt);
    const { wraps } = unlockWithKeyring();

    // Capture a record ciphertext under the live session before exporting.
    const [enc, nonce] = secretsStore.encryptRecord("secret-data");

    const bundle = secretsStore.exportPersistableBundle();
    expect(bundle.sessionId).toBe("sid-persist");
    expect(Object.keys(bundle).sort()).toEqual([
      "accountKeyB64",
      "authKeyB64",
      "authSaltB64",
      "sessionId",
    ]);

    secretsStore.lock();
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);

    secretsStore.restoreSession(bundle);
    expect(secretsStore.sessionId).toBe("sid-persist");

    // signRequest verifies against the independently-derived authKey
    const message = "query\n/user.heartbeat\n123\nabc\n{}";
    const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    const expectedAuthKey = await hkdf(sessionSecret, "sessionAuth", authSaltCopy);
    const sig = await secretsStore.signRequest(message);
    expect(await verifyHmac(expectedAuthKey, sig, message)).toBe(true);

    // Vault keys come from the local DB, unwrapped with the restored account key.
    expect(secretsStore.isVaultUnlocked).toBe(false);
    secretsStore.loadVaultKeys(wraps);
    expect(new TextDecoder().decode(secretsStore.decryptRecord(enc, nonce))).toBe("secret-data");
  });
});

describe("exportVaultKeyForWorker / exportAccountKey", () => {
  it("throw when the vault is locked", () => {
    expect(() => secretsStore.exportVaultKeyForWorker()).toThrow(/SessionLocked/);
    expect(() => secretsStore.exportAccountKey()).toThrow(/SessionLocked/);
  });

  it("return copies (mutation does not affect internal state)", () => {
    const { accountKey, personalKey } = unlockWithKeyring();

    const exportedVault = secretsStore.exportVaultKeyForWorker();
    const exportedAccount = secretsStore.exportAccountKey();
    expect(exportedVault).toEqual(personalKey);
    expect(exportedAccount).toEqual(accountKey);

    exportedVault.fill(0);
    exportedAccount.fill(0);

    const [enc, nonce] = secretsStore.encryptRecord("hi");
    expect(new TextDecoder().decode(secretsStore.decryptRecord(enc, nonce))).toBe("hi");
    expect(secretsStore.exportAccountKey()).toEqual(accountKey);
  });
});

describe("rewrapAccountKey", () => {
  it("wraps the in-memory account key under a new KEK", () => {
    const { accountKey } = unlockWithKeyring();
    const newKek = genKey();

    const [encrypted, nonce] = secretsStore.rewrapAccountKey(newKek);

    expect(unwrapAccountKey(newKek, encrypted, nonce)).toEqual(accountKey);
  });

  it("throws when locked", () => {
    expect(() => secretsStore.rewrapAccountKey(genKey())).toThrow(/SessionLocked/);
  });
});

describe("concurrent unlockSession calls (last write wins)", () => {
  it("does not corrupt state when two unlocks race", async () => {
    const saltA = genKey();
    const saltB = genKey();
    await Promise.all([
      secretsStore.unlockSession("sidA", "keyA", saltA),
      secretsStore.unlockSession("sidB", "keyB", saltB),
    ]);
    // store is in a consistent unlocked state — signing must work
    const sig = await secretsStore.signRequest("ping");
    expect(sig.length).toBeGreaterThan(0);
    // sessionId reflects one of the two attempts (whichever wrote last to the field)
    expect(["sidA", "sidB"]).toContain(secretsStore.sessionId);
  });
});
