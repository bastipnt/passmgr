import { argon2idAsync as nobleArgon2idAsync } from "@noble/hashes/argon2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { argon2idAsync, wasmArgon2idAsync } from "../src/util/argon2-impl";

const salt = new Uint8Array(16).map((_, i) => i * 7);

describe("WASM Argon2id", () => {
  it.each([
    { t: 1, m: 256, p: 1 },
    { t: 3, m: 1024, p: 1 },
    { t: 2, m: 1024, p: 4 },
    { t: 1, m: 2048, p: 4, dkLen: 64 },
  ])("matches @noble for %o", async (opts) => {
    const wasm = await wasmArgon2idAsync("correct horse ✓", salt, opts);
    const noble = await nobleArgon2idAsync("correct horse ✓", salt, opts);

    expect(bytesToHex(wasm)).toBe(bytesToHex(noble));
  });

  it("matches @noble at the 64 MiB floor with p = 4", { timeout: 30_000 }, async () => {
    const opts = { t: 1, m: 65536, p: 4 };
    const password = new TextEncoder().encode("hunter2");

    expect(bytesToHex(await wasmArgon2idAsync(password, salt, opts))).toBe(
      bytesToHex(await nobleArgon2idAsync(password, salt, opts)),
    );
  });

  it("matches @noble for the strong set", { timeout: 90_000 }, async () => {
    const opts = { t: 3, m: 128 * 1024, p: 4 };

    expect(bytesToHex(await wasmArgon2idAsync("pw", salt, opts))).toBe(
      bytesToHex(await nobleArgon2idAsync("pw", salt, opts)),
    );
  });

  // The RFC vector needs a secret and associated data, which hash-wasm can't
  // take: it pins @noble, the parity tests above pin the WASM to @noble.
  it("has its @noble reference match RFC 9106 §5.3", async () => {
    const tag = await nobleArgon2idAsync(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      t: 3,
      m: 32,
      p: 4,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
    });

    expect(bytesToHex(tag)).toBe(
      "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659",
    );
  });
});

describe("argon2idAsync", () => {
  afterEach(() => {
    vi.doUnmock("hash-wasm");
    vi.resetModules();
  });

  it("falls back to @noble when the WASM can't run, and stays there", async () => {
    const wasm = vi.fn().mockRejectedValue(new WebAssembly.CompileError("blocked by CSP"));
    vi.resetModules();
    vi.doMock("hash-wasm", () => ({ argon2id: wasm, argon2d: wasm }));
    const { argon2idAsync: withFallback } = await import("../src/util/argon2-impl");
    const opts = { t: 1, m: 256, p: 2 };

    const first = await withFallback("pw", salt, opts);
    await withFallback("pw", salt, opts);

    expect(bytesToHex(first)).toBe(bytesToHex(await nobleArgon2idAsync("pw", salt, opts)));
    expect(wasm).toHaveBeenCalledTimes(1);
  });

  it("throws bad input as it is, keeping the WASM", async () => {
    const wasm = vi
      .fn()
      .mockRejectedValue(new Error("Memory size should be at least 8 * parallelism."));
    vi.resetModules();
    vi.doMock("hash-wasm", () => ({ argon2id: wasm, argon2d: wasm }));
    const { argon2idAsync: withFallback } = await import("../src/util/argon2-impl");
    const opts = { t: 1, m: 8, p: 4 };

    await expect(withFallback("pw", salt, opts)).rejects.toThrow("8 * parallelism");
    await expect(withFallback("pw", salt, opts)).rejects.toThrow();
    expect(wasm).toHaveBeenCalledTimes(2);
  });

  it("uses the WASM when it runs", async () => {
    const opts = { t: 1, m: 256, p: 1 };
    expect(bytesToHex(await argon2idAsync("pw", salt, opts))).toBe(
      bytesToHex(await nobleArgon2idAsync("pw", salt, opts)),
    );
  });
});
