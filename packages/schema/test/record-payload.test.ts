import { describe, expect, it } from "vitest";
import { MAX_ENCRYPTED_RECORD_LENGTH } from "../src/record-limits";
import {
  MAX_PURGE_SEAL_LENGTH,
  MAX_SYNC_RECORDS,
  MIN_SYNC_RECORDS,
  pushInputSchema,
  syncInputSchema,
} from "../src/record-payload";
import { vaultMetaSchema } from "../src/vault-schema";

const UUID = "d4f5e9a0-1234-4abc-89ab-fedcba987654";

describe("pushInputSchema", () => {
  const change = {
    clientChangeId: UUID,
    recordId: UUID,
    vaultId: UUID,
    clientUpdatedAt: "2026-01-01T00:00:00Z",
  };
  const sealed = { encryptedData: "E", encryptionNonce: "N", cryptoVersion: 1, keyVersion: 1 };

  it("takes a put from base 0 (a new record) and a delete of a version", () => {
    const put = { ...change, ...sealed, op: "put", baseVersion: 0 };
    const del = {
      ...change,
      ...sealed,
      op: "delete",
      baseVersion: 1,
      clientChangeId: crypto.randomUUID(),
    };
    expect(pushInputSchema.parse({ changes: [put, del] }).changes).toHaveLength(2);
  });

  it("rejects a ciphertext over the largest record", () => {
    const put = {
      ...change,
      op: "put",
      baseVersion: 0,
      ...sealed,
      encryptedData: "E".repeat(MAX_ENCRYPTED_RECORD_LENGTH + 1),
    };
    expect(pushInputSchema.safeParse({ changes: [put] }).success).toBe(false);
  });

  it("rejects the same change twice in one batch", () => {
    const del = { ...change, ...sealed, op: "delete", baseVersion: 1 };
    expect(() => pushInputSchema.parse({ changes: [del, { ...del, baseVersion: 2 }] })).toThrow(
      /unique/,
    );
  });

  it.each([
    ["an empty batch", []],
    ["a delete of base 0 (nothing to delete)", [{ ...change, op: "delete", baseVersion: 0 }]],
    ["a put without ciphertext", [{ ...change, op: "put", baseVersion: 1 }]],
    ["a delete without ciphertext", [{ ...change, op: "delete", baseVersion: 1 }]],
    ["an unknown format", [{ ...change, ...sealed, cryptoVersion: 2, op: "put", baseVersion: 0 }]],
    [
      "a purge with content",
      [
        {
          ...change,
          ...sealed,
          encryptedData: "E".repeat(MAX_PURGE_SEAL_LENGTH + 1),
          op: "delete",
          baseVersion: 1,
          tombstoneKind: "purged",
        },
      ],
    ],
  ])("rejects %s", (_label, changes) => {
    expect(() => pushInputSchema.parse({ changes })).toThrow();
  });
});

describe("syncInputSchema", () => {
  it("defaults to no cursors (pull everything) in full pages", () => {
    expect(syncInputSchema.parse({})).toEqual({ cursors: {}, limit: MAX_SYNC_RECORDS });
  });

  it.each([MIN_SYNC_RECORDS - 1, MAX_SYNC_RECORDS + 1, 60.5])(
    "rejects a page size of %s",
    (limit) => {
      expect(() => syncInputSchema.parse({ limit })).toThrow();
    },
  );

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
