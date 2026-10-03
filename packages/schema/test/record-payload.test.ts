import { describe, expect, it } from "vitest";
import { createRecordInputSchema, syncInputSchema } from "../src/record-payload";
import { vaultMetaSchema } from "../src/vault-schema";

const UUID = "d4f5e9a0-1234-4abc-89ab-fedcba987654";

describe("createRecordInputSchema", () => {
  it("defaults cryptoVersion to 1 when omitted", () => {
    const parsed = createRecordInputSchema.parse({
      recordId: UUID,
      vaultId: UUID,
      encryptedData: "ENC",
      encryptionNonce: "NONCE",
      clientUpdatedAt: "2026-01-01T00:00:00Z",
    });
    expect(parsed.cryptoVersion).toBe(1);
  });
});

describe("syncInputSchema", () => {
  it("defaults to no cursors (pull everything)", () => {
    expect(syncInputSchema.parse({})).toEqual({ cursors: {} });
  });

  it.each([
    ["a non-UUID vault id", { personal: "2026-01-01T00:00:00.000Z" }],
    ["a cursor that isn't a timestamp", { [UUID]: "yesterday" }],
  ])("rejects %s", (_label, cursors) => {
    expect(() => syncInputSchema.parse({ cursors })).toThrow();
  });
});

describe("vaultMetaSchema", () => {
  it("trims the name and rejects an empty one", () => {
    expect(vaultMetaSchema.parse({ name: "  Work " })).toEqual({ name: "Work" });
    expect(() => vaultMetaSchema.parse({ name: "  " })).toThrow();
  });
});
