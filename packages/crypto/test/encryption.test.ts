import { describe, expect, it } from "vitest";
import {
  decryptXChaCha,
  decryptXChaChaWithAAD,
  encryptEmail,
  encryptXChaCha,
  encryptXChaChaWithAAD,
} from "../src/encryption";
import { hkdf } from "../src/hash";
import { fromBase64, fromString, toBase64 } from "@repo/util";

describe("xchacha20-poly1305", () => {
  it("roundtrips a string", () => {
    const key = new Uint8Array(32).fill(42);
    const [ct, nonce] = encryptXChaCha(key, "hello world");
    const pt = decryptXChaCha(key, ct, nonce);
    expect(new TextDecoder().decode(pt)).toBe("hello world");
  });

  it("roundtrips raw bytes", () => {
    const key = new Uint8Array(32).fill(9);
    const data = fromString("payload");
    const [ct, nonce] = encryptXChaCha(key, data);
    const pt = decryptXChaCha(key, ct, nonce);
    expect(pt).toEqual(data);
  });

  it("produces a unique nonce per call", () => {
    const key = new Uint8Array(32).fill(3);
    const [, nonceA] = encryptXChaCha(key, "x");
    const [, nonceB] = encryptXChaCha(key, "x");
    expect(nonceA).not.toBe(nonceB);
  });

  it("produces unique ciphertext for same plaintext (nonce-driven)", () => {
    const key = new Uint8Array(32).fill(11);
    const [ctA] = encryptXChaCha(key, "same");
    const [ctB] = encryptXChaCha(key, "same");
    expect(ctA).not.toBe(ctB);
  });

  it("throws on tampered ciphertext", () => {
    const key = new Uint8Array(32).fill(5);
    const [ct, nonce] = encryptXChaCha(key, "secret");
    const bytes = Uint8Array.fromBase64(ct);
    bytes[0] = bytes[0]! ^ 0xff;
    const tampered = bytes.toBase64();
    expect(() => decryptXChaCha(key, tampered, nonce)).toThrow();
  });

  it("fails to decrypt with wrong key", () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);
    const [ct, nonce] = encryptXChaCha(key1, "secret");
    expect(() => decryptXChaCha(key2, ct, nonce)).toThrow();
  });

  it("fails to decrypt with wrong nonce", () => {
    const key = new Uint8Array(32).fill(8);
    const [ct] = encryptXChaCha(key, "secret");
    const fakeNonce = toBase64(new Uint8Array(24).fill(0xaa));
    expect(() => decryptXChaCha(key, ct, fakeNonce)).toThrow();
  });
});

describe("xchacha20-poly1305 with AAD", () => {
  it("roundtrips a string with matching AAD", () => {
    const key = new Uint8Array(32).fill(13);
    const aad = fromString("context-v1");
    const [ct, nonce] = encryptXChaChaWithAAD(key, "auth me", aad);
    const pt = decryptXChaChaWithAAD(key, ct, nonce, aad);
    expect(new TextDecoder().decode(pt)).toBe("auth me");
  });

  it("roundtrips raw bytes with matching AAD", () => {
    const key = new Uint8Array(32).fill(14);
    const aad = new Uint8Array([1, 2, 3, 4]);
    const data = fromString("blob");
    const [ct, nonce] = encryptXChaChaWithAAD(key, data, aad);
    const pt = decryptXChaChaWithAAD(key, ct, nonce, aad);
    expect(pt).toEqual(data);
  });

  it("fails to decrypt when AAD differs", () => {
    const key = new Uint8Array(32).fill(15);
    const aad = fromString("ctx-a");
    const [ct, nonce] = encryptXChaChaWithAAD(key, "secret", aad);
    expect(() => decryptXChaChaWithAAD(key, ct, nonce, fromString("ctx-b"))).toThrow();
  });

  it("fails to decrypt when AAD missing on verify", () => {
    const key = new Uint8Array(32).fill(16);
    const aad = fromString("ctx");
    const [ct, nonce] = encryptXChaChaWithAAD(key, "secret", aad);
    expect(() => decryptXChaCha(key, ct, nonce)).toThrow();
  });

  it("produces a unique nonce per call with AAD", () => {
    const key = new Uint8Array(32).fill(17);
    const aad = fromString("ctx");
    const [, nonceA] = encryptXChaChaWithAAD(key, "x", aad);
    const [, nonceB] = encryptXChaChaWithAAD(key, "x", aad);
    expect(nonceA).not.toBe(nonceB);
  });
});

describe("encryptEmail", () => {
  it("round-trips by deriving the same email-encryption key from server key + salt", async () => {
    const serverKey = new Uint8Array(32).fill(99);
    const email = "  Alice@Example.COM ";
    const [encryptedEmail, nonce, saltB64] = await encryptEmail(serverKey, email);

    // Reproduce the derived key independently and decrypt.
    const derivedKey = await hkdf(serverKey, "emailEncryptionKey", fromBase64(saltB64));
    const decrypted = decryptXChaCha(derivedKey, encryptedEmail, nonce);
    expect(new TextDecoder().decode(decrypted)).toBe("alice@example.com");
  });

  it("produces unique salt and nonce across calls for the same email", async () => {
    const serverKey = new Uint8Array(32).fill(100);
    const a = await encryptEmail(serverKey, "user@example.com");
    const b = await encryptEmail(serverKey, "user@example.com");
    // [encryptedEmail, nonce, salt]
    expect(a[1]).not.toBe(b[1]);
    expect(a[2]).not.toBe(b[2]);
    expect(a[0]).not.toBe(b[0]);
  });

  it("encodes salt as 32-byte base64 (44 chars)", async () => {
    const serverKey = new Uint8Array(32).fill(101);
    const [, , salt] = await encryptEmail(serverKey, "x@y.z");
    expect(fromBase64(salt).length).toBe(32);
  });

  it("encodes nonce as 24-byte base64 (32 chars)", async () => {
    const serverKey = new Uint8Array(32).fill(102);
    const [, nonce] = await encryptEmail(serverKey, "x@y.z");
    expect(fromBase64(nonce).length).toBe(24);
  });
});
