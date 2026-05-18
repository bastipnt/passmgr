import { afterAll, describe, expect, it } from "vitest";
import { fromString } from "@repo/util";
import {
  genPasswordKek,
  getPasswordKekParams,
  hashEmail,
  hkdf,
  retrievePRK,
  setPasswordKekParams,
  signHmac,
  verifyHmac,
} from "../src/hash";
import { hkdfInfo } from "../src/util/constants";
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

  it("produces a distinct key for every hkdfInfo label", async () => {
    const key = fromString("ikm");
    const labels = Object.keys(hkdfInfo) as (keyof typeof hkdfInfo)[];
    const outputs = await Promise.all(labels.map((l) => hkdf(key, l)));
    const seen = new Set<string>();
    for (const out of outputs) {
      seen.add(Array.from(out).join(","));
    }
    expect(seen.size).toBe(labels.length);
  });

  it("differs when salt changes", async () => {
    const key = fromString("ikm");
    const salt1 = new Uint8Array(32).fill(1);
    const salt2 = new Uint8Array(32).fill(2);
    const a = await hkdf(key, "sessionAuth", salt1);
    const b = await hkdf(key, "sessionAuth", salt2);
    expect(a).not.toEqual(b);
  });

  it("differs when input key material changes", async () => {
    const a = await hkdf(fromString("ikm-a"), "sessionAuth");
    const b = await hkdf(fromString("ikm-b"), "sessionAuth");
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

describe("hashEmail", () => {
  it("normalizes email before hashing (trim + lowercase)", async () => {
    const serverKey = new Uint8Array(32).fill(50);
    const a = await hashEmail(serverKey, "  Alice@Example.COM ");
    const b = await hashEmail(serverKey, "alice@example.com");
    expect(a).toEqual(b);
  });

  it("differs across server keys (keyed hash)", async () => {
    const a = await hashEmail(new Uint8Array(32).fill(60), "alice@example.com");
    const b = await hashEmail(new Uint8Array(32).fill(61), "alice@example.com");
    expect(a).not.toEqual(b);
  });

  it("differs across emails for the same server key", async () => {
    const serverKey = new Uint8Array(32).fill(70);
    const a = await hashEmail(serverKey, "alice@example.com");
    const b = await hashEmail(serverKey, "bob@example.com");
    expect(a).not.toEqual(b);
  });

  it("returns a 32-byte digest", async () => {
    const out = await hashEmail(new Uint8Array(32).fill(80), "x@y.z");
    expect(out.length).toBe(32);
  });
});

describe("genPasswordKek / retrievePRK", () => {
  // Fast params for tests — real prod params validated by the smoke test below.
  const FAST_PARAMS = { t: 1, m: 8, p: 1 } as const;
  // Argon2id with prod params (t:3, m:128MiB, p:1) takes a few seconds.
  const ARGON_TIMEOUT_MS = 60_000;

  it(
    "uses prod defaults (t:3, m:128MiB, p:1) when no params given",
    async () => {
      const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(
        "correct horse battery staple",
      );
      expect(passwordKek.length).toBe(32);
      expect(passwordKekSaltData.length).toBe(32);
      expect(passwordKekParams).toEqual({ t: 3, m: 128 * 1024, p: 1 });
    },
    ARGON_TIMEOUT_MS,
  );

  it("derives a 32-byte KEK from a password and a random salt", async () => {
    const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(
      "correct horse battery staple",
      FAST_PARAMS,
    );
    expect(passwordKek.length).toBe(32);
    expect(passwordKekSaltData.length).toBe(32);
    expect(passwordKekParams).toEqual(FAST_PARAMS);
  });

  it("retrievePRK matches genPasswordKek with the same salt + params", async () => {
    const password = "correct horse battery staple";
    const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(
      password,
      FAST_PARAMS,
    );
    const prk = await retrievePRK(password, passwordKekSaltData, passwordKekParams);
    expect(prk).toEqual(passwordKek);
  });

  it("retrievePRK differs for a wrong password", async () => {
    const password = "right";
    const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(
      password,
      FAST_PARAMS,
    );
    const prk = await retrievePRK("wrong", passwordKekSaltData, passwordKekParams);
    expect(prk).not.toEqual(passwordKek);
  });

  it("retrievePRK differs for a wrong salt", async () => {
    const password = "p";
    const { passwordKek, passwordKekParams } = await genPasswordKek(password, FAST_PARAMS);
    const prk = await retrievePRK(password, new Uint8Array(32).fill(0), passwordKekParams);
    expect(prk).not.toEqual(passwordKek);
  });

  it("genPasswordKek picks a fresh random salt each call", async () => {
    const a = await genPasswordKek("p", FAST_PARAMS);
    const b = await genPasswordKek("p", FAST_PARAMS);
    expect(a.passwordKekSaltData).not.toEqual(b.passwordKekSaltData);
    expect(a.passwordKek).not.toEqual(b.passwordKek);
  });
});

describe("wipe", () => {
  it("zeroes the buffer in place", () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });
});

describe("setPasswordKekParams / getPasswordKekParams", () => {
  const PROD = { t: 3, m: 128 * 1024, p: 1 };
  afterAll(() => setPasswordKekParams(PROD));

  it("getPasswordKekParams returns the prod default until the setter is called", () => {
    setPasswordKekParams(PROD);
    expect(getPasswordKekParams()).toEqual(PROD);
  });

  it("setPasswordKekParams swaps the active default used by genPasswordKek", async () => {
    const fast = { t: 1, m: 8, p: 1 };
    setPasswordKekParams(fast);
    expect(getPasswordKekParams()).toEqual(fast);
    const { passwordKekParams } = await genPasswordKek("p");
    expect(passwordKekParams).toEqual(fast);
  });
});
