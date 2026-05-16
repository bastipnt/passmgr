import { describe, expect, it } from "vitest";
import { genKey, genSalt, wipe } from "../src/util/secrets-utils";

describe("wipe", () => {
  it("zeroes a populated Uint8Array in place", () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0]);
  });

  it("is a no-op on an already-zero buffer", () => {
    const buf = new Uint8Array(8);
    wipe(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it("handles an empty buffer without throwing", () => {
    const buf = new Uint8Array(0);
    expect(() => wipe(buf)).not.toThrow();
  });

  it("mutates in place (same reference)", () => {
    const buf = new Uint8Array([9, 9, 9]);
    const ref = buf;
    wipe(buf);
    expect(ref).toBe(buf);
    expect(ref.every((b) => b === 0)).toBe(true);
  });
});

describe("genSalt", () => {
  it("returns 32 random bytes", () => {
    const s = genSalt();
    expect(s).toBeInstanceOf(Uint8Array);
    expect(s.length).toBe(32);
  });

  it("does not collide across 1000 draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(Array.from(genSalt()).join(","));
    }
    expect(seen.size).toBe(1000);
  });
});

describe("genKey", () => {
  it("returns 32 random bytes", () => {
    const k = genKey();
    expect(k).toBeInstanceOf(Uint8Array);
    expect(k.length).toBe(32);
  });

  it("does not collide across 1000 draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(Array.from(genKey()).join(","));
    }
    expect(seen.size).toBe(1000);
  });
});
