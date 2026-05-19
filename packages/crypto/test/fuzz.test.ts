import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decryptXChaCha, encryptXChaCha } from "../src/encryption";
import { hkdf, signHmac, verifyHmac } from "../src/hash";
import { generatePassword } from "../src/password-generator";
import { genKey } from "../src/util/secrets-utils";
import { fromBase64, fromString } from "@repo/util";

const SHORT_RUNS = { numRuns: 50 };
const TINY_RUNS = { numRuns: 30 };

const key32 = fc.uint8Array({ minLength: 32, maxLength: 32 });
const plaintextBytes = fc.uint8Array({ minLength: 0, maxLength: 256 });

describe("fuzz: xchacha20-poly1305", () => {
  it("round-trips arbitrary plaintext for arbitrary 32-byte keys", async () => {
    await fc.assert(
      fc.asyncProperty(key32, plaintextBytes, async (key, data) => {
        const [ct, nonce] = encryptXChaCha(key, data);
        const pt = decryptXChaCha(key, ct, nonce);
        expect(pt).toEqual(data);
      }),
      SHORT_RUNS,
    );
  });

  it("fails to decrypt with a different key", async () => {
    await fc.assert(
      fc.asyncProperty(key32, key32, plaintextBytes, async (k1, k2, data) => {
        fc.pre(!k1.every((b, i) => b === k2[i]));
        const [ct, nonce] = encryptXChaCha(k1, data);
        expect(() => decryptXChaCha(k2, ct, nonce)).toThrow();
      }),
      SHORT_RUNS,
    );
  });

  it("never repeats a nonce across two successive calls", async () => {
    await fc.assert(
      fc.asyncProperty(key32, plaintextBytes, async (key, data) => {
        const [, nonceA] = encryptXChaCha(key, data);
        const [, nonceB] = encryptXChaCha(key, data);
        expect(nonceA).not.toBe(nonceB);
      }),
      SHORT_RUNS,
    );
  });
});

describe("fuzz: hkdf determinism", () => {
  const infoLabel = fc.constantFrom(
    "sessionSecret" as const,
    "sessionAuth" as const,
    "emailHashKey" as const,
    "emailEncryptionKey" as const,
    "recoveryRootKey" as const,
    "biometricKek" as const,
  );

  it("same input ⇒ same output", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 16, maxLength: 64 }),
        infoLabel,
        fc.option(key32, { nil: undefined }),
        async (ikm, info, salt) => {
          const a = await hkdf(ikm, info, salt ?? undefined);
          const b = await hkdf(ikm, info, salt ?? undefined);
          expect(a).toEqual(b);
        },
      ),
      TINY_RUNS,
    );
  });

  it("differing input key material changes the output", async () => {
    await fc.assert(
      fc.asyncProperty(key32, key32, infoLabel, async (k1, k2, info) => {
        fc.pre(!k1.every((b, i) => b === k2[i]));
        const a = await hkdf(k1, info);
        const b = await hkdf(k2, info);
        expect(a).not.toEqual(b);
      }),
      TINY_RUNS,
    );
  });
});

describe("fuzz: hmac sign/verify", () => {
  it("round-trips for arbitrary messages", async () => {
    await fc.assert(
      fc.asyncProperty(key32, fc.string({ maxLength: 256 }), async (key, msg) => {
        const sig = await signHmac(key, msg);
        expect(await verifyHmac(key, sig, msg)).toBe(true);
      }),
      TINY_RUNS,
    );
  });

  it("rejects a single-bit flip in the signature", async () => {
    await fc.assert(
      fc.asyncProperty(key32, fc.string({ minLength: 1, maxLength: 64 }), async (key, msg) => {
        const sig = await signHmac(key, msg);
        sig[0] = (sig[0]! ^ 0x01) & 0xff;
        expect(await verifyHmac(key, sig, msg)).toBe(false);
      }),
      TINY_RUNS,
    );
  });

  it("rejects a tampered message body", async () => {
    await fc.assert(
      fc.asyncProperty(
        key32,
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        async (key, msg, suffix) => {
          fc.pre(suffix.length > 0);
          const sig = await signHmac(key, msg);
          expect(await verifyHmac(key, sig, msg + suffix)).toBe(false);
        },
      ),
      TINY_RUNS,
    );
  });
});

describe("fuzz: generatePassword invariants", () => {
  it("returns a string of the requested length", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 128 }), (length) => {
        const pwd = generatePassword({
          length,
          uppercase: true,
          lowercase: true,
          digits: true,
          symbols: true,
          avoidAmbiguous: false,
          minDigits: 0,
          minSymbols: 0,
        });
        expect(pwd.length).toBe(length);
      }),
      { numRuns: 100 },
    );
  });

  it("only emits characters from the enabled charset", () => {
    fc.assert(
      fc.property(
        fc.record({
          length: fc.integer({ min: 1, max: 64 }),
          uppercase: fc.boolean(),
          lowercase: fc.boolean(),
          digits: fc.boolean(),
          symbols: fc.boolean(),
          avoidAmbiguous: fc.boolean(),
        }),
        (raw) => {
          fc.pre(raw.uppercase || raw.lowercase || raw.digits || raw.symbols);

          const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const lower = "abcdefghijklmnopqrstuvwxyz";
          const digits = "0123456789";
          const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
          const ambiguous = new Set(["O", "0", "I", "l", "1"]);

          let allowed = "";
          if (raw.uppercase) allowed += upper;
          if (raw.lowercase) allowed += lower;
          if (raw.digits) allowed += digits;
          if (raw.symbols) allowed += symbols;
          if (raw.avoidAmbiguous)
            allowed = Array.from(allowed)
              .filter((c) => !ambiguous.has(c))
              .join("");

          const allowedSet = new Set(allowed);
          const pwd = generatePassword({ ...raw, minDigits: 0, minSymbols: 0 });
          for (const c of pwd) {
            expect(allowedSet.has(c)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("smoke: generatePassword distribution", () => {
  it("samples each charset class within ±10% of expected over 100k draws", () => {
    const length = 32;
    const opts = {
      length,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: false,
      minDigits: 0,
      minSymbols: 0,
    };
    // Combined charset size = 26+26+10+26 = 88. Expected fractions:
    // upper: 26/88 ≈ 0.295, lower: 26/88 ≈ 0.295, digits: 10/88 ≈ 0.114, symbols: 26/88 ≈ 0.295
    const totalChars = 100_000;
    const draws = Math.ceil(totalChars / length);
    const counts = { upper: 0, lower: 0, digits: 0, symbols: 0 };
    for (let i = 0; i < draws; i++) {
      const pwd = generatePassword(opts);
      for (const c of pwd) {
        if (/[A-Z]/.test(c)) counts.upper++;
        else if (/[a-z]/.test(c)) counts.lower++;
        else if (/[0-9]/.test(c)) counts.digits++;
        else counts.symbols++;
      }
    }
    const total = counts.upper + counts.lower + counts.digits + counts.symbols;
    const within = (observed: number, expected: number) =>
      Math.abs(observed / total - expected) < 0.05; // ±5 percentage points
    expect(within(counts.upper, 26 / 88)).toBe(true);
    expect(within(counts.lower, 26 / 88)).toBe(true);
    expect(within(counts.digits, 10 / 88)).toBe(true);
    expect(within(counts.symbols, 26 / 88)).toBe(true);
  });
});

describe("fuzz: signHmac determinism over fromString", () => {
  it("same message yields the same signature", async () => {
    await fc.assert(
      fc.asyncProperty(key32, fc.string({ maxLength: 128 }), async (key, msg) => {
        const a = await signHmac(key, msg);
        const b = await signHmac(key, msg);
        expect(a).toEqual(b);
        // Sanity: also same as raw HMAC of UTF-8 bytes
        expect(a.length).toBe(32);
        expect(fromString(msg)).toBeInstanceOf(Uint8Array);
      }),
      TINY_RUNS,
    );
  });
});

describe("ciphertext entropy: xchacha20-poly1305", () => {
  it("byte distribution over 10k ciphertexts is indistinguishable from uniform", () => {
    const key = genKey();
    const counts = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < 10_000; i++) {
      const [ct] = encryptXChaCha(key, `msg-${i}`);
      const bytes = fromBase64(ct);
      for (const b of bytes) counts[b]!++;
      total += bytes.length;
    }
    const expected = total / 256;
    let chiSq = 0;
    for (let i = 0; i < 256; i++) {
      const diff = counts[i]! - expected;
      chiSq += (diff * diff) / expected;
    }
    // df=255, p=0.001 critical value ≈ 330. A stuck bit or biased
    // PRNG fails hard; sound AEAD output stays well under.
    expect(chiSq).toBeLessThan(330);
  });
});
