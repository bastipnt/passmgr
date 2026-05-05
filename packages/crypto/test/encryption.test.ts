import { describe, expect, it } from "vitest";
import { decryptXChaCha, encryptXChaCha } from "../src/encryption";
import { fromString } from "@repo/util";

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
});
