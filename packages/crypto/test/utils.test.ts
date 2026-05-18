import { describe, expect, it } from "vitest";
import { normalize } from "../src/util/string-utils";
import { getMessage } from "../src/util/general";
import {
  hkdfInfo,
  SESSION_ID_HEADER,
  SESSION_NONCE_HEADER,
  SESSION_SALT_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
} from "../src/util/constants";

const NONCE = "00000000-0000-4000-8000-000000000000";

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
  it("composes type, path, timestamp, nonce, and body separated by newlines", () => {
    const msg = getMessage("mutation", "/entry.update", "1700000000", NONCE, { id: "abc" });
    expect(msg).toBe(`mutation\n/entry.update\n1700000000\n${NONCE}\n{"id":"abc"}`);
  });

  it("is deterministic for identical inputs", () => {
    const a = getMessage("mutation", "/x", "1", NONCE, { k: "v" });
    const b = getMessage("mutation", "/x", "1", NONCE, { k: "v" });
    expect(a).toBe(b);
  });

  it("changes when type changes", () => {
    const a = getMessage("query", "/x", "1", NONCE, { k: "v" });
    const b = getMessage("mutation", "/x", "1", NONCE, { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when path changes", () => {
    const a = getMessage("query", "/a", "1", NONCE, { k: "v" });
    const b = getMessage("query", "/b", "1", NONCE, { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when timestamp changes", () => {
    const a = getMessage("query", "/x", "1", NONCE, { k: "v" });
    const b = getMessage("query", "/x", "2", NONCE, { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when nonce changes", () => {
    const a = getMessage("query", "/x", "1", NONCE, { k: "v" });
    const b = getMessage("query", "/x", "1", "different-nonce", { k: "v" });
    expect(a).not.toBe(b);
  });

  it("changes when body changes", () => {
    const a = getMessage("query", "/x", "1", NONCE, { k: "v" });
    const b = getMessage("query", "/x", "1", NONCE, { k: "w" });
    expect(a).not.toBe(b);
  });

  it("handles an empty body object", () => {
    expect(getMessage("query", "/x", "1", NONCE, {})).toBe(`query\n/x\n1\n${NONCE}\n{}`);
  });

  it('falls back to "" when body is nullish', () => {
    // The TS signature requires a Record, but the runtime guards against a missing body.
    const msg = getMessage(
      "query",
      "/x",
      "1",
      NONCE,
      undefined as unknown as Record<string, string>,
    );
    expect(msg).toBe(`query\n/x\n1\n${NONCE}\n""`);
  });
});

describe("constants", () => {
  it("exposes session header names", () => {
    expect(SESSION_ID_HEADER).toBe("x-session-id");
    expect(SESSION_TIMESTAMP_HEADER).toBe("x-timestamp");
    expect(SESSION_SIGNATURE_HEADER).toBe("x-signature");
    expect(SESSION_SALT_HEADER).toBe("x-salt");
    expect(SESSION_NONCE_HEADER).toBe("x-nonce");
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
