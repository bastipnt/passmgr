import { generateSshKeyPair, sshKeyFingerprint } from "@repo/crypto";
import { describe, expect, it } from "vitest";
import {
  type FormFieldSpec,
  multilineSummary,
  noteSummary,
  RECORD_FORM_FIELDS,
} from "../src/records/record-form-fields";

const spec = (key: string) =>
  (RECORD_FORM_FIELDS.ssh_key as readonly FormFieldSpec[])
    .concat(RECORD_FORM_FIELDS.api_key as readonly FormFieldSpec[])
    .find((field) => field.key === key) as FormFieldSpec;

describe("noteSummary", () => {
  it("says 0 words when empty or blank", () => {
    expect(noteSummary("")).toBe("0 words");
    expect(noteSummary("  \n")).toBe("0 words · 3 characters");
  });

  it("counts words across lines and tabs", () => {
    expect(noteSummary("one two\nthree\tfour\n\nfive")).toBe("5 words · 24 characters");
    expect(noteSummary("hi")).toBe("1 word · 2 characters");
  });

  it("counts an emoji or a combined letter as one character", () => {
    expect(noteSummary("👍🏽 café")).toBe("2 words · 6 characters");
    expect(noteSummary("👨‍👩‍👧")).toBe("1 word · 1 character");
  });
});

describe("multilineSummary", () => {
  const { privateKey, publicKey } = generateSshKeyPair();

  it("names the private key's format", () => {
    expect(multilineSummary(spec("privateKey"), privateKey)).toBe("OpenSSH · ssh-ed25519");
  });

  it("shows the public key's fingerprint", () => {
    expect(multilineSummary(spec("publicKey"), publicKey)).toBe(sshKeyFingerprint(publicKey));
  });

  it("falls back to the character count", () => {
    expect(multilineSummary(spec("publicKey"), "not a key")).toBe("9 characters");
    expect(multilineSummary(spec("secret"), "")).toBe("0 characters");
    expect(multilineSummary(spec("secret"), "sk_live_1")).toBe("9 characters");
  });

  it("keeps a masked secret's length to itself, not its format", () => {
    expect(multilineSummary(spec("secret"), "sk_live_1", true)).toBe("");
    expect(multilineSummary(spec("privateKey"), privateKey, true)).toBe("OpenSSH · ssh-ed25519");
  });
});
