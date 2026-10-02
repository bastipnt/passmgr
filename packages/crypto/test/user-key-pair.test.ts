import { x25519 } from "@noble/curves/ed25519.js";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { describe, expect, it } from "vitest";
import { encryptXChaChaWithAAD } from "../src/encryption";
import {
  createUserKeyPair,
  publicKeyFingerprint,
  sealToPublicKey,
  unsealWithPrivateKey,
  unwrapUserPrivateKey,
} from "../src/user-key-pair";
import { genKey } from "../src/util/secrets-utils";

const AAD = fromString("passmgr/vault-key/v1/vault-a/1");

describe("createUserKeyPair / unwrapUserPrivateKey", () => {
  it("wraps a private key under the account key that belongs to the public key", () => {
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);

    expect(keyPair.keyVersion).toBe(1);
    expect(fromBase64(keyPair.publicKey)).toHaveLength(32);
    const privateKey = unwrapUserPrivateKey(accountKey, keyPair);
    expect(toBase64(x25519.getPublicKey(privateKey))).toBe(keyPair.publicKey);
  });

  it("creates a different keypair every time", () => {
    const accountKey = genKey();
    expect(createUserKeyPair(accountKey).publicKey).not.toBe(
      createUserKeyPair(accountKey).publicKey,
    );
  });

  it("doesn't open under another account key", () => {
    const keyPair = createUserKeyPair(genKey());
    expect(() => unwrapUserPrivateKey(genKey(), keyPair)).toThrow();
  });

  it("doesn't open under another key version (AAD)", () => {
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);
    expect(() => unwrapUserPrivateKey(accountKey, { ...keyPair, keyVersion: 2 })).toThrow();
  });

  it("rejects a private key paired with someone else's public key", () => {
    const accountKey = genKey();
    const mine = createUserKeyPair(accountKey);
    const other = createUserKeyPair(genKey());
    expect(() => unwrapUserPrivateKey(accountKey, { ...mine, publicKey: other.publicKey })).toThrow(
      "doesn't match",
    );
  });

  it("rejects a correctly wrapped private key that isn't the public key's", () => {
    // The server can't produce this (it has no account key), but the check
    // doesn't rely on that.
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);
    const [encryptedPrivateKey, privateKeyEncryptionNonce] = encryptXChaChaWithAAD(
      accountKey,
      genKey(),
      fromString("passmgr/user-private-key/v1/1"),
    );
    expect(() =>
      unwrapUserPrivateKey(accountKey, {
        ...keyPair,
        encryptedPrivateKey,
        privateKeyEncryptionNonce,
      }),
    ).toThrow("doesn't match");
  });
});

describe("sealToPublicKey / unsealWithPrivateKey", () => {
  function recipient() {
    const accountKey = genKey();
    const keyPair = createUserKeyPair(accountKey);
    return { keyPair, privateKey: unwrapUserPrivateKey(accountKey, keyPair) };
  }

  it("round-trips to the recipient's private key", async () => {
    const { keyPair, privateKey } = recipient();
    const vaultKey = genKey();

    const sealed = await sealToPublicKey(keyPair.publicKey, vaultKey, AAD);

    expect(await unsealWithPrivateKey(privateKey, sealed, AAD)).toEqual(vaultKey);
  });

  it("uses a fresh ephemeral key per seal", async () => {
    const { keyPair } = recipient();
    const vaultKey = genKey();
    const a = fromBase64(await sealToPublicKey(keyPair.publicKey, vaultKey, AAD));
    const b = fromBase64(await sealToPublicKey(keyPair.publicKey, vaultKey, AAD));
    expect(a.subarray(0, 32)).not.toEqual(b.subarray(0, 32));
  });

  it("lays out ephemeral key ‖ nonce ‖ ciphertext + tag", async () => {
    const { keyPair } = recipient();
    const sealed = fromBase64(await sealToPublicKey(keyPair.publicKey, genKey(), AAD));
    expect(sealed).toHaveLength(32 + 24 + 32 + 16);
  });

  it("doesn't open with another private key", async () => {
    const { keyPair } = recipient();
    const other = recipient();
    const sealed = await sealToPublicKey(keyPair.publicKey, genKey(), AAD);
    await expect(unsealWithPrivateKey(other.privateKey, sealed, AAD)).rejects.toThrow();
  });

  it("doesn't open with another AAD", async () => {
    const { keyPair, privateKey } = recipient();
    const sealed = await sealToPublicKey(keyPair.publicKey, genKey(), AAD);
    await expect(
      unsealWithPrivateKey(privateKey, sealed, fromString("passmgr/vault-key/v1/vault-b/1")),
    ).rejects.toThrow();
  });

  it("rejects a tampered box", async () => {
    const { keyPair, privateKey } = recipient();
    const sealed = fromBase64(await sealToPublicKey(keyPair.publicKey, genKey(), AAD));
    for (const index of [0, 40, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[index]! ^= 1;
      await expect(unsealWithPrivateKey(privateKey, toBase64(tampered), AAD)).rejects.toThrow();
    }
  });

  it("rejects a box too short to hold the header", async () => {
    const { privateKey } = recipient();
    await expect(
      unsealWithPrivateKey(privateKey, toBase64(new Uint8Array(55)), AAD),
    ).rejects.toThrow("too short");
  });

  it("refuses to seal to a low-order public key", async () => {
    await expect(sealToPublicKey(toBase64(new Uint8Array(32)), genKey(), AAD)).rejects.toThrow();
  });
});

describe("publicKeyFingerprint", () => {
  it("is six groups of five digits", () => {
    const { publicKey } = createUserKeyPair(genKey());
    expect(publicKeyFingerprint(publicKey)).toMatch(/^\d{5}( \d{5}){5}$/);
  });

  it("is stable for a key and differs between keys", () => {
    const a = createUserKeyPair(genKey()).publicKey;
    const b = createUserKeyPair(genKey()).publicKey;
    expect(publicKeyFingerprint(a)).toBe(publicKeyFingerprint(a));
    expect(publicKeyFingerprint(a)).not.toBe(publicKeyFingerprint(b));
  });

  it("matches a known vector (format pinned)", () => {
    expect(publicKeyFingerprint(toBase64(new Uint8Array(32).fill(9)))).toMatchInlineSnapshot(
      `"31097 39042 64238 79004 16333 83159"`,
    );
  });
});
