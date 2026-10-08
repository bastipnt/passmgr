import { exportEnvelopeSchema } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { exportKdf, openExport, sealExport } from "../src/export-envelope";
import { genKey, genSalt } from "../src/util/secrets-utils";

const kdf = exportKdf(genSalt(), { t: 3, m: 64 * 1024, p: 4 });

describe("export envelope", () => {
  it("round-trips and matches its schema", () => {
    const key = genKey();
    const envelope = sealExport(key, kdf, '{"records":[]}');

    expect(exportEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope.kdf).toEqual({ algorithm: "argon2id", salt: kdf.salt, t: 3, m: 65536, p: 4 });
    expect(openExport(key, envelope)).toBe('{"records":[]}');
  });

  it("doesn't carry the plaintext", () => {
    const envelope = sealExport(genKey(), kdf, "hunter2-secret");
    expect(JSON.stringify(envelope)).not.toContain("hunter2");
  });

  it("refuses another key", () => {
    const envelope = sealExport(genKey(), kdf, "{}");
    expect(() => openExport(genKey(), envelope)).toThrow();
  });

  it("refuses a changed ciphertext", () => {
    const key = genKey();
    const envelope = sealExport(key, kdf, "{}");
    const data = Uint8Array.from(atob(envelope.data), (c) => c.charCodeAt(0));
    data[0]! ^= 1;
    const tampered = { ...envelope, data: btoa(String.fromCharCode(...data)) };
    expect(() => openExport(key, tampered)).toThrow();
  });
});
