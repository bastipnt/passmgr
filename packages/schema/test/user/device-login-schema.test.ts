import { describe, expect, it } from "vitest";
import type z from "zod";
import {
  COSE_ALG,
  finishDeviceLoginInputSchema,
  registerDeviceCredentialInputSchema,
  SUPPORTED_COSE_ALGS,
  startDeviceLoginInputSchema,
  startDeviceLoginOutputSchema,
} from "../../src/user/device-login-schema";
import { nonCanonicalBase64 } from "../../testing/non-canonical";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

describe("COSE algorithms", () => {
  it("are the IANA ids of ES256, EdDSA and RS256", () => {
    expect(COSE_ALG).toEqual({ ES256: -7, EdDSA: -8, RS256: -257 });
  });

  it("lists every named algorithm once, ES256 first", () => {
    expect(SUPPORTED_COSE_ALGS).toEqual([-7, -8, -257]);
  });
});

// Field, schema, a byte count with unused low bits in its padded spelling, and the length bounds.
const BASE64_FIELDS: [string, z.ZodObject, number, { tooShort?: string; max: number }][] = [
  ["credentialId", startDeviceLoginInputSchema, 16, { tooShort: "", max: 1400 }],
  ["credentialId", registerDeviceCredentialInputSchema, 16, { tooShort: "", max: 1400 }],
  ["nonce", startDeviceLoginOutputSchema, 32, { tooShort: b64(30), max: 44 }],
  ["serverPublicKey", startDeviceLoginOutputSchema, 32, { tooShort: b64(30), max: 44 }],
  ["clientPublicKey", finishDeviceLoginInputSchema, 32, { tooShort: b64(30), max: 44 }],
  ["authSalt", finishDeviceLoginInputSchema, 32, { tooShort: b64(30), max: 44 }],
  ["authenticatorData", finishDeviceLoginInputSchema, 37, { max: 4096 }],
  ["clientDataJSON", finishDeviceLoginInputSchema, 200, { max: 4096 }],
  ["signature", finishDeviceLoginInputSchema, 70, { max: 1024 }],
  ["publicKey", registerDeviceCredentialInputSchema, 91, { max: 2048 }],
];

describe("canonical base64 fields", () => {
  it.each(BASE64_FIELDS)("%s takes only the canonical spelling", (field, schema, bytes) => {
    const canonical = b64(bytes);
    const fieldSchema = schema.shape[field] as z.ZodType;
    expect(fieldSchema.parse(canonical)).toBe(canonical);
    expect(fieldSchema.safeParse(nonCanonicalBase64(canonical)).success).toBe(false);
    expect(fieldSchema.safeParse(canonical.replace(/=+$/, "")).success).toBe(false);
  });

  it.each(BASE64_FIELDS)("%s keeps its length bound", (field, schema, _bytes, bound) => {
    const fieldSchema = schema.shape[field] as z.ZodType;
    expect(fieldSchema.safeParse("A".repeat(bound.max + 4)).success).toBe(false);
    if (bound.tooShort !== undefined) {
      expect(fieldSchema.safeParse(bound.tooShort).success).toBe(false);
    }
  });
});
