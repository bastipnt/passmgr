import { describe, expect, it } from "vitest";
import {
  createRecordInputSchema,
  encryptedRecordSchema,
  syncInputSchema,
  syncOutputSchema,
  updateRecordInputSchema,
  CURRENT_CRYPTO_VERSION,
} from "../src/record-payload";

const UUID = "d4f5e9a0-1234-4abc-89ab-fedcba987654";
const baseRecord = {
  recordId: UUID,
  encryptedData: "ENC",
  encryptionNonce: "NONCE",
  cryptoVersion: 1,
  version: 1,
  clientUpdatedAt: "2026-01-01T00:00:00Z",
};

describe("encryptedRecordSchema", () => {
  it("accepts a minimal record", () => {
    expect(() => encryptedRecordSchema.parse(baseRecord)).not.toThrow();
  });

  it("rejects non-uuid recordId", () => {
    expect(() => encryptedRecordSchema.parse({ ...baseRecord, recordId: "not-uuid" })).toThrow();
  });

  it("rejects non-positive version", () => {
    expect(() => encryptedRecordSchema.parse({ ...baseRecord, version: 0 })).toThrow();
    expect(() => encryptedRecordSchema.parse({ ...baseRecord, version: -1 })).toThrow();
  });
});

describe("createRecordInputSchema", () => {
  it("defaults cryptoVersion when omitted", () => {
    const parsed = createRecordInputSchema.parse({
      recordId: UUID,
      encryptedData: "ENC",
      encryptionNonce: "NONCE",
      clientUpdatedAt: "2026-01-01T00:00:00Z",
    });
    expect(parsed.cryptoVersion).toBe(1);
  });

  it("rejects missing recordId", () => {
    expect(() =>
      createRecordInputSchema.parse({
        encryptedData: "ENC",
        encryptionNonce: "NONCE",
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("updateRecordInputSchema", () => {
  it("requires version", () => {
    expect(() =>
      updateRecordInputSchema.parse({
        recordId: UUID,
        encryptedData: "ENC",
        encryptionNonce: "NONCE",
        cryptoVersion: 1,
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("sync schemas", () => {
  it("accepts an empty sync input", () => {
    expect(() => syncInputSchema.parse({})).not.toThrow();
  });

  it("accepts a sync output with empty record list", () => {
    expect(() =>
      syncOutputSchema.parse({ records: [], serverTimestamp: "2026-01-01T00:00:00Z" }),
    ).not.toThrow();
  });
});

describe("CURRENT_CRYPTO_VERSION", () => {
  it("is 1", () => {
    expect(CURRENT_CRYPTO_VERSION).toBe(1);
  });
});
