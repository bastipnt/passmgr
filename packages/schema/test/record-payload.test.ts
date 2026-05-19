import { describe, expect, it } from "vitest";
import { createRecordInputSchema } from "../src/record-payload";

const UUID = "d4f5e9a0-1234-4abc-89ab-fedcba987654";

describe("createRecordInputSchema", () => {
  it("defaults cryptoVersion to 1 when omitted", () => {
    const parsed = createRecordInputSchema.parse({
      recordId: UUID,
      encryptedData: "ENC",
      encryptionNonce: "NONCE",
      clientUpdatedAt: "2026-01-01T00:00:00Z",
    });
    expect(parsed.cryptoVersion).toBe(1);
  });
});
