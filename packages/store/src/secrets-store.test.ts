import { beforeEach, describe, expect, it } from "vitest";

import { encryptXChaCha, genKey, hkdf, verifyHmac } from "@repo/crypto";
import { fromString } from "@repo/util";
import { secretsStore } from "./secrets-store";

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

describe("unlockVault", () => {
  it("decrypts the vault key and wipes the passwordKek buffer", () => {
    const passwordKek = genKey();
    const vaultKey = genKey();
    const [encVault, nonce] = encryptXChaCha(passwordKek, vaultKey);

    // make a working copy of the kek because encrypt+decrypt share key state via reference
    const kekCopy = passwordKek.slice();

    secretsStore.unlockVault(kekCopy, encVault, nonce);

    expect(secretsStore.isVaultUnlocked).toBe(true);
    // passwordKek buffer was wiped in place
    expect(Array.from(kekCopy).every((b) => b === 0)).toBe(true);
  });

  it("throws when the passwordKek is tampered (single byte flip)", () => {
    const passwordKek = genKey();
    const vaultKey = genKey();
    const [encVault, nonce] = encryptXChaCha(passwordKek, vaultKey);

    const tampered = passwordKek.slice();
    tampered[0] = tampered[0]! ^ 0x01;

    expect(() => secretsStore.unlockVault(tampered, encVault, nonce)).toThrow();
    expect(secretsStore.isVaultUnlocked).toBe(false);
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

  it("round-trips after unlockWithVaultKey (biometric path)", () => {
    const vaultKey = genKey();
    secretsStore.unlockWithVaultKey(vaultKey);

    const [enc, nonce] = secretsStore.encryptRecord("hello");
    const plain = secretsStore.decryptRecord(enc, nonce);
    expect(new TextDecoder().decode(plain)).toBe("hello");
  });

  it("biometric unlock does not enable signRequest (no authKey)", async () => {
    secretsStore.unlockWithVaultKey(genKey());
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);
  });
});

describe("lock", () => {
  it("clears sessionId and disables signing + record decryption", async () => {
    await secretsStore.unlockSession("sid", "k", genKey());
    secretsStore.unlockWithVaultKey(genKey());

    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(secretsStore.sessionId).toBe("sid");

    secretsStore.lock();

    expect(secretsStore.sessionId).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);
    expect(() => secretsStore.encryptRecord("x")).toThrow(/SessionLocked/);
  });

  it("wipes every internal buffer (sessionSecret, authKey, authSalt, vaultKey)", async () => {
    const authSalt = genKey();
    const vaultKey = genKey();

    await secretsStore.unlockSession("sid", "session-key", authSalt);
    secretsStore.unlockWithVaultKey(vaultKey);

    // Grab live references to every internal buffer before lock().
    const internal = secretsStore._peekBuffers();
    expect(internal.sessionSecret).toBeDefined();
    expect(internal.authKey).toBeDefined();
    expect(internal.authSalt).toBeDefined();
    expect(internal.vaultKey).toBeDefined();

    secretsStore.lock();

    // Every internal buffer must be zeroed in place.
    expect(internal.sessionSecret!.every((b) => b === 0)).toBe(true);
    expect(internal.authKey!.every((b) => b === 0)).toBe(true);
    expect(internal.authSalt!.every((b) => b === 0)).toBe(true);
    expect(internal.vaultKey!.every((b) => b === 0)).toBe(true);

    // The input buffers we still hold references to are the same memory and
    // are therefore zeroed too.
    expect(authSalt.every((b) => b === 0)).toBe(true);
    expect(vaultKey.every((b) => b === 0)).toBe(true);
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

describe("exportVaultKeyForWorker", () => {
  it("throws when the vault is locked", () => {
    expect(() => secretsStore.exportVaultKeyForWorker()).toThrow(/SessionLocked/);
  });

  // TODO: do I want this?
  it("returns a copy of the vault key (mutation does not affect internal state)", () => {
    const vk = genKey();
    secretsStore.unlockWithVaultKey(vk.slice());

    const exported = secretsStore.exportVaultKeyForWorker();
    expect(Array.from(exported)).toEqual(Array.from(vk));

    // mutate the exported copy
    exported.fill(0);
    // internal still usable
    const [enc, nonce] = secretsStore.encryptRecord("hi");
    expect(new TextDecoder().decode(secretsStore.decryptRecord(enc, nonce))).toBe("hi");
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
