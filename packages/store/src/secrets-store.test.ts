import {
  createUserKeyPair,
  decryptRecordData,
  encryptRecordData,
  encryptVaultMeta,
  genKey,
  hkdf,
  unwrapAccountKey,
  verifyHmac,
  wrapAccountKey,
  wrapPreviousVaultKey,
  wrapVaultKey,
} from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { fromString, toBase64 } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { secretsStore } from "./secrets-store";

const PERSONAL_ID = "0199a3c4-0000-7000-8000-00000000000a";
const WORK_ID = "0199a3c4-0000-7000-8000-00000000000b";

/** A vault as the server hands it out: the key wrapped under the account key, plus metadata. */
function memberVault(
  accountKey: Uint8Array,
  vaultKey: Uint8Array,
  vaultId: string,
  kind: MemberVault["kind"],
  name: string = kind,
): MemberVault {
  return {
    ...wrapVaultKey(accountKey, vaultKey, vaultId, 1),
    ...encryptVaultMeta(vaultKey, vaultId, { name }),
    previousKeys: [],
    kind,
    role: "owner",
  };
}

/** Fresh account + vault keys and their wraps, as the server would hand them out. */
function keyring() {
  const accountKey = genKey();
  const personalKey = genKey();
  const workKey = genKey();
  const wraps: MemberVault[] = [
    memberVault(accountKey, personalKey, PERSONAL_ID, "personal", "Personal"),
    memberVault(accountKey, workKey, WORK_ID, "shared", "Work"),
  ];
  return { accountKey, personalKey, workKey, wraps };
}

const RECORD_ID = "0199a3c4-0000-7000-8000-0000000000aa";

function decryptAs(
  [encryptedData, encryptionNonce]: readonly [string, string, ...unknown[]],
  vaultId: string,
  recordId = RECORD_ID,
): string {
  const bytes = secretsStore.decryptRecord({
    recordId,
    vaultId,
    cryptoVersion: 1,
    keyVersion: 1,
    encryptedData,
    encryptionNonce,
  });
  return new TextDecoder().decode(bytes);
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

  it("skips another vault whose wrap doesn't open and reports it", () => {
    const { accountKey, wraps } = keyring();
    const foreign = memberVault(genKey(), genKey(), WORK_ID, "shared");
    secretsStore.unlockWithAccountKey(accountKey);

    expect(secretsStore.loadVaultKeys([wraps[0]!, foreign])).toEqual([WORK_ID]);
    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(() =>
      secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: WORK_ID }, "x"),
    ).toThrow(/SessionLocked/);
  });

  it("refuses a personal vault whose wrap doesn't open and keeps nothing", () => {
    const { accountKey, wraps } = keyring();
    const foreign = memberVault(genKey(), genKey(), PERSONAL_ID, "personal");
    secretsStore.unlockWithAccountKey(accountKey);

    expect(() => secretsStore.loadVaultKeys([foreign, wraps[1]!])).toThrow();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore._peekBuffers().vaultKeys).toEqual([]);
  });

  it("refuses a key list with two personal vaults", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);

    expect(() =>
      secretsStore.loadVaultKeys([wraps[0]!, { ...wraps[1]!, kind: "personal" }]),
    ).toThrow(/personal vault/);
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

    expect(() => secretsStore.loadVaultKeys([...wraps, wraps[1]!])).toThrow(/Duplicate vault/);
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

  it("keeps the loaded keys when a replacement list's personal vault doesn't open", () => {
    const { accountKey, wraps } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(wraps);
    const sealed = secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: WORK_ID }, "kept");

    const foreign = memberVault(genKey(), genKey(), PERSONAL_ID, "personal");
    expect(() => secretsStore.loadVaultKeys([foreign, wraps[1]!])).toThrow();

    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(decryptAs(sealed, WORK_ID)).toBe("kept");
  });
});

describe("rotated vault keys", () => {
  /** The work vault at key version 3: its keys 1 and 2 each wrapped under their successor. */
  function rotatedTwice() {
    const ring = keyring();
    const key2 = genKey();
    const key3 = genKey();
    const work: MemberVault = {
      ...ring.wraps[1]!,
      ...wrapVaultKey(ring.accountKey, key3, WORK_ID, 3),
      ...encryptVaultMeta(key3, WORK_ID, { name: "Work" }),
      previousKeys: [
        wrapPreviousVaultKey(key2, ring.workKey, WORK_ID, 1),
        wrapPreviousVaultKey(key3, key2, WORK_ID, 2),
      ],
    };
    secretsStore.unlockWithAccountKey(ring.accountKey.slice());
    return { ...ring, key2, key3, wraps: [ring.wraps[0]!, work] };
  }

  function sealUnder(key: Uint8Array, keyVersion: number, data: string) {
    const context = { recordId: RECORD_ID, vaultId: WORK_ID, cryptoVersion: 1 };
    const [encryptedData, encryptionNonce] = encryptRecordData(key, context, data);
    return {
      recordId: RECORD_ID,
      vaultId: WORK_ID,
      cryptoVersion: 1,
      keyVersion,
      encryptedData,
      encryptionNonce,
    };
  }

  it("encrypt under the current key and open records of every earlier one", () => {
    const { wraps, workKey, key2 } = rotatedTwice();
    secretsStore.loadVaultKeys(wraps);

    expect(secretsStore.currentKeyVersion(WORK_ID)).toBe(3);
    const [, , keyVersion] = secretsStore.encryptRecord(
      { recordId: RECORD_ID, vaultId: WORK_ID },
      "x",
    );
    expect(keyVersion).toBe(3);
    for (const [key, version] of [
      [workKey, 1],
      [key2, 2],
    ] as const) {
      const row = sealUnder(key, version, `v${version}`);
      expect(new TextDecoder().decode(secretsStore.decryptRecord(row))).toBe(`v${version}`);
    }
    // The worker gets every version.
    expect([...secretsStore.exportVaultKeysForWorker().keys()].sort()).toEqual(
      [`${PERSONAL_ID}/1`, `${WORK_ID}/1`, `${WORK_ID}/2`, `${WORK_ID}/3`].sort(),
    );
  });

  it("stop at a link that doesn't open: only the history below it stays closed", () => {
    const { wraps, workKey, key2 } = rotatedTwice();
    const work = wraps[1]!;
    const broken = {
      ...work,
      previousKeys: [work.previousKeys[0]!, { ...work.previousKeys[0]!, keyVersion: 2 }],
    };
    secretsStore.loadVaultKeys([wraps[0]!, broken]);

    expect(() => secretsStore.decryptRecord(sealUnder(key2, 2, "x"))).toThrow();
    expect(() => secretsStore.decryptRecord(sealUnder(workKey, 1, "x"))).toThrow();
    expect(secretsStore.currentKeyVersion(WORK_ID)).toBe(3);
  });

  it("rotateVaultKey makes the next version, the current key wrapped under it", () => {
    const { wraps } = unlockWithKeyring();
    const rotated = secretsStore.rotateVaultKey(wraps[1]!);

    expect(rotated).toMatchObject({
      vaultId: WORK_ID,
      keyVersion: 2,
      previousKey: { keyVersion: 1 },
    });
    secretsStore.loadVaultKeys([
      wraps[0]!,
      { ...wraps[1]!, ...rotated, previousKeys: [rotated.previousKey] },
    ]);
    expect(secretsStore.currentKeyVersion(WORK_ID)).toBe(2);
    expect(secretsStore.decryptVaultMeta({ ...wraps[1]!, ...rotated })).toEqual({ name: "Work" });
  });
});

describe("decryptVaultMeta / encryptVaultMeta", () => {
  it("opens each vault's metadata with its own key", () => {
    const { wraps } = unlockWithKeyring();

    expect(secretsStore.decryptVaultMeta(wraps[0]!)).toEqual({ name: "Personal" });
    expect(secretsStore.decryptVaultMeta(wraps[1]!)).toEqual({ name: "Work" });
  });

  it("refuses metadata moved to another vault", () => {
    const { wraps } = unlockWithKeyring();
    const swapped = { ...wraps[1]!, vaultId: PERSONAL_ID };

    expect(() => secretsStore.decryptVaultMeta(swapped)).toThrow();
  });

  it("round-trips new metadata", () => {
    unlockWithKeyring();
    const meta = secretsStore.encryptVaultMeta(WORK_ID, { name: "Job", color: "red" });

    expect(secretsStore.decryptVaultMeta({ vaultId: WORK_ID, ...meta })).toEqual({
      name: "Job",
      color: "red",
    });
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
    expect(() =>
      secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: PERSONAL_ID }, "data"),
    ).toThrow(/SessionLocked/);
    expect(() => decryptAs(["x", "y"], PERSONAL_ID)).toThrow(/SessionLocked/);
  });

  it("round-trips in each vault", () => {
    unlockWithKeyring();

    for (const vaultId of [PERSONAL_ID, WORK_ID]) {
      const sealed = secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId }, "hello");
      expect(decryptAs(sealed, vaultId)).toBe("hello");
    }
  });

  it("encrypts under the record's vault key, bound to record and vault", () => {
    const { workKey } = unlockWithKeyring();

    const [enc, nonce] = secretsStore.encryptRecord(
      { recordId: RECORD_ID, vaultId: WORK_ID },
      "hello",
    );

    const context = { recordId: RECORD_ID, vaultId: WORK_ID, cryptoVersion: 1 };
    expect(new TextDecoder().decode(decryptRecordData(workKey, context, enc, nonce))).toBe("hello");
    expect(() => decryptAs([enc, nonce], PERSONAL_ID)).toThrow();
    expect(() => decryptAs([enc, nonce], WORK_ID, crypto.randomUUID())).toThrow();
  });

  it("refuses a vault it holds no key for", () => {
    unlockWithKeyring();
    expect(() =>
      secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: crypto.randomUUID() }, "x"),
    ).toThrow(/SessionLocked/);
  });

  it("defaults new records to the personal vault", () => {
    unlockWithKeyring();
    expect(secretsStore.defaultVaultId).toBe(PERSONAL_ID);
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
    expect(() =>
      secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: PERSONAL_ID }, "x"),
    ).toThrow(/SessionLocked/);
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
  it("throws while the vault is locked, even with a server session", async () => {
    expect(() => secretsStore.exportPersistableBundle()).toThrow(/SessionLocked/);

    await secretsStore.unlockSession("sid", "k", genKey());
    expect(() => secretsStore.exportPersistableBundle()).toThrow(/SessionLocked/);
  });

  it("exports only the account key without a server session (local / offline)", () => {
    const { accountKey } = unlockWithKeyring();

    const bundle = secretsStore.exportPersistableBundle();
    expect(bundle).toEqual({ accountKeyB64: toBase64(accountKey) });

    secretsStore.lock();
    secretsStore.restoreSession(bundle);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("round-trips: a restored store signs and, after reloading vault keys, decrypts (no OPAQUE/Argon2)", async () => {
    const sessionKey = "persist-session-key";
    const authSalt = genKey();
    const authSaltCopy = authSalt.slice(); // lock() will zero the stored authSalt

    await secretsStore.unlockSession("sid-persist", sessionKey, authSalt);
    const { wraps } = unlockWithKeyring();

    // Capture a record ciphertext under the live session before exporting.
    const sealed = secretsStore.encryptRecord(
      { recordId: RECORD_ID, vaultId: PERSONAL_ID },
      "secret-data",
    );

    const bundle = secretsStore.exportPersistableBundle();
    expect(Object.keys(bundle).sort()).toEqual(["accountKeyB64", "server"]);
    expect(bundle.server?.sessionId).toBe("sid-persist");
    expect(Object.keys(bundle.server ?? {}).sort()).toEqual([
      "authKeyB64",
      "authSaltB64",
      "sessionId",
    ]);

    secretsStore.lock();
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);

    secretsStore.restoreSession(bundle);
    expect(secretsStore.sessionId).toBe("sid-persist");
    expect(secretsStore.hasServerSession).toBe(true);

    // signRequest verifies against the independently-derived authKey
    const message = "query\n/user.heartbeat\n123\nabc\n{}";
    const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    const expectedAuthKey = await hkdf(sessionSecret, "sessionAuth", authSaltCopy);
    const sig = await secretsStore.signRequest(message);
    expect(await verifyHmac(expectedAuthKey, sig, message)).toBe(true);

    // Vault keys come from the local DB, unwrapped with the restored account key.
    expect(secretsStore.isVaultUnlocked).toBe(false);
    secretsStore.loadVaultKeys(wraps);
    expect(decryptAs(sealed, PERSONAL_ID)).toBe("secret-data");
  });

  it("restoring a bundle without a server session drops the one attached before", async () => {
    const { accountKey } = unlockWithKeyring();
    await secretsStore.unlockSession("sid-old", "k", genKey());

    secretsStore.restoreSession({ accountKeyB64: toBase64(accountKey) });

    expect(secretsStore.hasServerSession).toBe(false);
    await expect(secretsStore.signRequest("x")).rejects.toThrow(/SessionLocked/);
  });
});

describe("detachServer", () => {
  it("wipes the server session keys in place and keeps the vault unlocked", async () => {
    await secretsStore.unlockSession("sid", "k", genKey());
    unlockWithKeyring();
    const { sessionSecret, authKey, authSalt } = secretsStore._peekBuffers();

    secretsStore.detachServer();

    expect(secretsStore.hasServerSession).toBe(false);
    expect(secretsStore.sessionId).toBeUndefined();
    for (const buffer of [sessionSecret, authKey, authSalt]) {
      expect(buffer?.every((b) => b === 0)).toBe(true);
    }
    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(
      decryptAs(
        secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: PERSONAL_ID }, "x"),
        PERSONAL_ID,
      ),
    ).toBe("x");
  });
});

describe("exportVaultKeysForWorker / exportAccountKey", () => {
  it("throw when the vault is locked", () => {
    expect(() => secretsStore.exportVaultKeysForWorker()).toThrow(/SessionLocked/);
    expect(() => secretsStore.exportAccountKey()).toThrow(/SessionLocked/);
  });

  it("return copies (mutation does not affect internal state)", () => {
    const { accountKey, personalKey, workKey } = unlockWithKeyring();

    const exportedVaults = secretsStore.exportVaultKeysForWorker();
    const exportedAccount = secretsStore.exportAccountKey();
    expect(exportedVaults).toEqual(
      new Map([
        [`${PERSONAL_ID}/1`, personalKey],
        [`${WORK_ID}/1`, workKey],
      ]),
    );
    expect(exportedAccount).toEqual(accountKey);

    for (const key of exportedVaults.values()) key.fill(0);
    exportedAccount.fill(0);

    const sealed = secretsStore.encryptRecord({ recordId: RECORD_ID, vaultId: WORK_ID }, "hi");
    expect(decryptAs(sealed, WORK_ID)).toBe("hi");
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

describe("lockEpoch", () => {
  it("changes on every lock, and not on detaching the server", async () => {
    unlockWithKeyring();
    const before = secretsStore.lockEpoch;

    await secretsStore.unlockSession("sid", "k", genKey());
    secretsStore.detachServer();
    expect(secretsStore.lockEpoch).toBe(before);

    secretsStore.lock();
    const afterLock = secretsStore.lockEpoch;
    expect(afterLock).not.toBe(before);

    unlockWithKeyring();
    secretsStore.lockVault();
    expect(secretsStore.lockEpoch).not.toBe(afterLock);
  });
});
