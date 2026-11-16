import { describe, expect, it } from "vitest";
import { genKey } from "../src/util/secrets-utils";
import {
  decryptRecordData,
  decryptVaultMeta,
  encryptRecordData,
  encryptVaultMeta,
  type RecordCipherContext,
  recordCipherContext,
} from "../src/vault-data";

const draft: RecordCipherContext = {
  recordId: crypto.randomUUID(),
  vaultId: crypto.randomUUID(),
  cryptoVersion: 1,
  stage: "draft",
  version: 3,
  keyVersion: 1,
  state: "live",
};

const context: RecordCipherContext = { ...draft, stage: "sealed" };

describe("record encryption", () => {
  it("round-trips in its own context", () => {
    const key = genKey();
    const [enc, nonce] = encryptRecordData(key, context, "secret");

    expect(new TextDecoder().decode(decryptRecordData(key, context, enc, nonce))).toBe("secret");
  });

  it.each([
    ["another record", { recordId: crypto.randomUUID() }],
    ["another vault", { vaultId: crypto.randomUUID() }],
    ["another crypto version", { cryptoVersion: 2 }],
    ["a draft", { stage: "draft" as const }],
    ["another version", { version: 4 }],
    ["another key version", { keyVersion: 2 }],
    ["a tombstone", { state: "deleted" as const }],
    ["a moved record", { state: "moved" as const }],
    ["a purge", { state: "purged" as const }],
  ])("refuses to open as %s", (_label, change) => {
    const key = genKey();
    const [enc, nonce] = encryptRecordData(key, context, "secret");

    expect(() => decryptRecordData(key, { ...context, ...change }, enc, nonce)).toThrow();
  });

  it("binds a draft to its record and vault only", () => {
    const key = genKey();
    const [enc, nonce] = encryptRecordData(key, draft, "secret");
    const elsewhere = { ...draft, version: 9, keyVersion: 2, state: "deleted" as const };

    expect(new TextDecoder().decode(decryptRecordData(key, elsewhere, enc, nonce))).toBe("secret");
    expect(() => decryptRecordData(key, context, enc, nonce)).toThrow();
  });

  it("reads a stored row's state from its tombstone", () => {
    const row = {
      ...context,
      deleted_at: null as string | null,
      tombstoneKind: null as "moved" | "purged" | null,
    };
    const stateOf = (r: typeof row) => recordCipherContext(r, "sealed").state;
    expect(stateOf(row)).toBe("live");
    expect(stateOf({ ...row, deleted_at: "2026-11-16T00:00:00Z" })).toBe("deleted");
    expect(stateOf({ ...row, deleted_at: "2026-11-16T00:00:00Z", tombstoneKind: "purged" })).toBe(
      "purged",
    );
  });

  it("refuses another vault key", () => {
    const [enc, nonce] = encryptRecordData(genKey(), context, "secret");
    expect(() => decryptRecordData(genKey(), context, enc, nonce)).toThrow();
  });
});

describe("vault metadata encryption", () => {
  it("round-trips for its vault and refuses another", () => {
    const key = genKey();
    const vaultId = crypto.randomUUID();
    const meta = encryptVaultMeta(key, vaultId, { name: "Work", icon: "briefcase" });

    expect(decryptVaultMeta(key, vaultId, meta)).toEqual({ name: "Work", icon: "briefcase" });
    expect(() => decryptVaultMeta(key, crypto.randomUUID(), meta)).toThrow();
    expect(() => decryptVaultMeta(genKey(), vaultId, meta)).toThrow();
  });
});
