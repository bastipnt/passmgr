import { describe, expect, it } from "vitest";
import { normalize } from "../src/util/string-utils";
import { getMessage } from "../src/util/general";
import {
  hkdfInfo,
  SESSION_ID_HEADER,
  SESSION_SALT_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
} from "../src/util/constants";

describe("normalize", () => {
  it("trims whitespace from both ends", () => {
    expect(normalize("   alice@example.com   ")).toBe("alice@example.com");
  });

  it("lowercases ASCII", () => {
    expect(normalize("ALICE@EXAMPLE.COM")).toBe("alice@example.com");
  });

  it("preserves unicode lowercase", () => {
    expect(normalize("  ÜserName@Example.COM ")).toBe("üsername@example.com");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalize("   \t\n  ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalize("  Foo@Bar.com ");
    expect(normalize(once)).toBe(once);
  });
});

describe("getMessage", () => {
  it("composes type, path, timestamp, and body separated by newlines", () => {
    const msg = getMessage("mutation", "/entry.update", "1700000000", { id: "abc" });
    expect(msg).toBe('mutation\n/entry.update\n1700000000\n{"id":"abc"}');
  });

  it("is deterministic for identical inputs", () => {
    const a = getMessage("mutation", "/x", "1", { k: "v" });
    const b = getMessage("mutation", "/x", "1", { k: "v" });
    expect(a).toBe(b);
  });

  it("changes when type changes", () => {
    const a = getMessage("query", "/x", "1", { k: "v" });
    const b = getMessage("mutation", "/x", "1", { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when path changes", () => {
    const a = getMessage("query", "/a", "1", { k: "v" });
    const b = getMessage("query", "/b", "1", { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when timestamp changes", () => {
    const a = getMessage("query", "/x", "1", { k: "v" });
    const b = getMessage("query", "/x", "2", { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when body changes", () => {
    const a = getMessage("query", "/x", "1", { k: "v" });
    const b = getMessage("query", "/x", "1", { k: "w" });
    expect(a).not.toBe(b);
  });

  it("handles an empty body object", () => {
    expect(getMessage("query", "/x", "1", {})).toBe("query\n/x\n1\n{}");
  });

  it('falls back to "" when body is nullish', () => {
    // The TS signature requires a Record, but the runtime guards against a missing body.
    const msg = getMessage("query", "/x", "1", undefined as unknown as Record<string, string>);
    expect(msg).toBe('query\n/x\n1\n""');
  });
});

describe("constants", () => {
  it("exposes session header names", () => {
    expect(SESSION_ID_HEADER).toBe("x-session-id");
    expect(SESSION_TIMESTAMP_HEADER).toBe("x-timestamp");
    expect(SESSION_SIGNATURE_HEADER).toBe("x-signature");
    expect(SESSION_SALT_HEADER).toBe("x-salt");
  });

  it("encodes hkdfInfo labels as UTF-8 bytes matching their string form", () => {
    const dec = new TextDecoder();
    expect(dec.decode(hkdfInfo.sessionSecret)).toBe("session-secret");
    expect(dec.decode(hkdfInfo.sessionAuth)).toBe("session-auth");
    expect(dec.decode(hkdfInfo.emailHashKey)).toBe("email-hash-key");
    expect(dec.decode(hkdfInfo.emailEncryptionKey)).toBe("email-encryption-key");
    expect(dec.decode(hkdfInfo.recoveryRootKey)).toBe("recovery-root-key");
    expect(dec.decode(hkdfInfo.biometricKek)).toBe("biometric-kek");
  });

  it("hkdfInfo labels are pairwise distinct byte sequences", () => {
    const labels = Object.values(hkdfInfo);
    const seen = new Set<string>();
    for (const l of labels) seen.add(Array.from(l).join(","));
    expect(seen.size).toBe(labels.length);
  });
});
