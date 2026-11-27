import { describe, expect, it } from "vitest";
import type z from "zod";
import { exportEnvelopeSchema, exportKdfSchema } from "../src/export-schema";
import { nonCanonicalBase64 } from "../testing/non-canonical";

const b64 = (bytes: number) => Buffer.from(new Uint8Array(bytes)).toString("base64");

const kdf = (params: { t: number; m: number; p: number }) => ({
  algorithm: "argon2id",
  salt: b64(16),
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

// Field, schema, a byte count with unused low bits in its padded spelling.
const BASE64_FIELDS: [string, z.ZodObject, number][] = [
  ["salt", exportKdfSchema, 16],
  ["nonce", exportEnvelopeSchema, 23],
  ["data", exportEnvelopeSchema, 100],
];

describe("canonical base64 fields", () => {
  it.each(BASE64_FIELDS)("%s takes only the canonical spelling", (field, schema, bytes) => {
    const canonical = b64(bytes);
    const fieldSchema = schema.shape[field] as z.ZodType;
    expect(fieldSchema.parse(canonical)).toBe(canonical);
    expect(fieldSchema.safeParse(nonCanonicalBase64(canonical)).success).toBe(false);
    expect(fieldSchema.safeParse(canonical.replace(/=+$/, "")).success).toBe(false);
  });
});
