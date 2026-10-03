import { describe, expect, it } from "vitest";
import { genKey } from "../src/util/secrets-utils";
import {
  decryptRecordData,
  decryptVaultMeta,
  encryptRecordData,
  encryptVaultMeta,
  type RecordCipherContext,
} from "../src/vault-data";

const context: RecordCipherContext = {
  recordId: crypto.randomUUID(),
  vaultId: crypto.randomUUID(),
  cryptoVersion: 1,
};

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
  ])("refuses to open as %s", (_label, change) => {
    const key = genKey();
    const [enc, nonce] = encryptRecordData(key, context, "secret");

    expect(() => decryptRecordData(key, { ...context, ...change }, enc, nonce)).toThrow();
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
