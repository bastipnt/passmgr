import { describe, expect, it } from "vitest";
import { pushInputSchema, syncInputSchema } from "../src/record-payload";
import { vaultMetaSchema } from "../src/vault-schema";

const UUID = "d4f5e9a0-1234-4abc-89ab-fedcba987654";

describe("pushInputSchema", () => {
  const change = {
    clientChangeId: UUID,
    recordId: UUID,
    vaultId: UUID,
    clientUpdatedAt: "2026-01-01T00:00:00Z",
  };

  it("takes a put from base 0 (a new record) and a delete of a version", () => {
    const put = {
      ...change,
      op: "put",
      baseVersion: 0,
      encryptedData: "E",
      encryptionNonce: "N",
      cryptoVersion: 1,
    };
    const del = { ...change, op: "delete", baseVersion: 1, clientChangeId: crypto.randomUUID() };
    expect(pushInputSchema.parse({ changes: [put, del] }).changes).toHaveLength(2);
  });

  it("rejects the same change twice in one batch", () => {
    const del = { ...change, op: "delete", baseVersion: 1 };
    expect(() => pushInputSchema.parse({ changes: [del, { ...del, baseVersion: 2 }] })).toThrow(
      /unique/,
    );
  });

  it.each([
    ["an empty batch", []],
    ["a delete of base 0 (nothing to delete)", [{ ...change, op: "delete", baseVersion: 0 }]],
    ["a put without ciphertext", [{ ...change, op: "put", baseVersion: 1 }]],
  ])("rejects %s", (_label, changes) => {
    expect(() => pushInputSchema.parse({ changes })).toThrow();
  });
});

describe("syncInputSchema", () => {
  it("defaults to no cursors (pull everything)", () => {
    expect(syncInputSchema.parse({})).toEqual({ cursors: {} });
  });

  it.each([
    ["a non-UUID vault id", { personal: 1 }],
    ["a cursor that isn't a seq", { [UUID]: "yesterday" }],
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
