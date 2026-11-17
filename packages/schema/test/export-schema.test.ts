import { describe, expect, it } from "vitest";
import { exportKdfSchema } from "../src/export-schema";

const kdf = (params: { t: number; m: number; p: number }) => ({
  algorithm: "argon2id",
  salt: Buffer.from(new Uint8Array(16)).toString("base64"),
  ...params,
});

describe("exportKdfSchema", () => {
  it("accepts the params a device picks for a new backup", () => {
    expect(exportKdfSchema.safeParse(kdf({ t: 3, m: 128 * 1024, p: 4 })).success).toBe(true);
  });

  it.each([
    ["memory", { t: 3, m: 4 * 1024 * 1024, p: 4 }],
    ["iterations", { t: 10_000, m: 64 * 1024, p: 4 }],
    ["parallelism", { t: 3, m: 64 * 1024, p: 256 }],
  ])("refuses a backup asking for unbounded %s", (_name, params) => {
    expect(exportKdfSchema.safeParse(kdf(params)).success).toBe(false);
  });
});
