import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRemainingTime, getToken } from "../src/totp";
import { fromString } from "@repo/util";

// RFC 6238 Appendix B test vectors, SHA-1, 30s period, 6-digit:
// Secret (ASCII): "12345678901234567890" (20 bytes)
const rfcSecret = fromString("12345678901234567890");

// [unixTimeSeconds, expectedToken]
const rfcVectors: ReadonlyArray<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("getToken — RFC 6238 SHA-1 known-answer vectors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const [t, expected] of rfcVectors) {
    it(`produces ${expected} at unix time ${t}`, async () => {
      vi.setSystemTime(new Date(t * 1000));
      const token = await getToken(rfcSecret);
      expect(token).toBe(expected);
    });
  }
});

describe("getToken — input handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59 * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a Uint8Array secret", async () => {
    const token = await getToken(rfcSecret);
    expect(token).toBe("287082");
  });

  it("accepts a base32 string secret equivalent to the same raw bytes", async () => {
    // ASCII "12345678901234567890" -> base32
    const base32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const token = await getToken(base32);
    expect(token).toBe("287082");
  });

  it("returns a 6-digit string", async () => {
    const token = await getToken(rfcSecret);
    expect(token).toMatch(/^[0-9]{6}$/);
  });

  it("is stable within the same 30-second window", async () => {
    vi.setSystemTime(new Date(60 * 1000));
    const a = await getToken(rfcSecret);
    vi.setSystemTime(new Date(89 * 1000));
    const b = await getToken(rfcSecret);
    expect(a).toBe(b);
  });

  it("changes when the 30-second window rolls over", async () => {
    vi.setSystemTime(new Date(60 * 1000));
    const a = await getToken(rfcSecret);
    vi.setSystemTime(new Date(90 * 1000));
    const b = await getToken(rfcSecret);
    expect(a).not.toBe(b);
  });
});

describe("getToken — guardrails", () => {
  it("rejects a secret shorter than MIN_SECRET_BYTES (10)", async () => {
    const short = new Uint8Array(5).fill(0xaa);
    await expect(getToken(short)).rejects.toThrow();
  });
});

describe("getRemainingTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 30 at the start of a 30s window", () => {
    vi.setSystemTime(new Date(60 * 1000));
    expect(getRemainingTime()).toBe(30);
  });

  it("returns 1 one second before window end", () => {
    vi.setSystemTime(new Date(89 * 1000));
    expect(getRemainingTime()).toBe(1);
  });

  it("returns a value in [1, 30] for arbitrary times", () => {
    for (let s = 0; s < 120; s++) {
      vi.setSystemTime(new Date(s * 1000));
      const r = getRemainingTime();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(30);
    }
  });
});
