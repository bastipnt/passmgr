import { describe, expect, it } from "vitest";
import { fromString } from "@repo/util";
import { hkdf, signHmac, verifyHmac } from "../src/hash";
import { wipe } from "../src/util/secrets-utils";

describe("hkdf", () => {
  it("returns 32 bytes", async () => {
    const key = fromString("input-key-material");
    const out = await hkdf(key, "sessionSecret");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(32);
  });

  it("is deterministic for same inputs", async () => {
    const key = fromString("ikm");
    const a = await hkdf(key, "sessionAuth");
    const b = await hkdf(key, "sessionAuth");
    expect(a).toEqual(b);
  });

  it("differs across info labels", async () => {
    const key = fromString("ikm");
    const a = await hkdf(key, "sessionSecret");
    const b = await hkdf(key, "sessionAuth");
    expect(a).not.toEqual(b);
  });

  it("differs when salt changes", async () => {
    const key = fromString("ikm");
    const salt1 = new Uint8Array(32).fill(1);
    const salt2 = new Uint8Array(32).fill(2);
    const a = await hkdf(key, "sessionAuth", salt1);
    const b = await hkdf(key, "sessionAuth", salt2);
    expect(a).not.toEqual(b);
  });
});

describe("hmac sign/verify", () => {
  it("verifies a valid signature", async () => {
    const key = new Uint8Array(32).fill(7);
    const msg = "POST\n/login.finish\n1700000000\n{}";
    const sig = await signHmac(key, msg);
    expect(await verifyHmac(key, sig, msg)).toBe(true);
  });

  it("rejects a tampered message", async () => {
    const key = new Uint8Array(32).fill(7);
    const msg = "POST\n/login.finish\n1700000000\n{}";
    const sig = await signHmac(key, msg);
    expect(await verifyHmac(key, sig, msg + "x")).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const key = new Uint8Array(32).fill(7);
    const msg = "msg";
    const sig = await signHmac(key, msg);
    sig[0] = sig[0]! ^ 0xff;
    expect(await verifyHmac(key, sig, msg)).toBe(false);
  });

  it("rejects with wrong key", async () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);
    const msg = "msg";
    const sig = await signHmac(key1, msg);
    expect(await verifyHmac(key2, sig, msg)).toBe(false);
  });
});

describe("wipe", () => {
  it("zeroes the buffer in place", () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });
});
