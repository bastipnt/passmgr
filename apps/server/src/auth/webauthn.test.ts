import { generateKeyPairSync } from "node:crypto";
import { fromBase64 } from "@repo/util";
import { describe, expect, it } from "vitest";
import { fakeAuthenticator } from "../../test/setup/fake-authenticator";
import { credentialKey, verifyAssertion } from "./webauthn";

const challenge = new Uint8Array(32).fill(7);
const allowedOrigins = new Set(["http://localhost:8080", "https://vault.example.com"]);

function check(
  authenticator: ReturnType<typeof fakeAuthenticator>,
  assertion: ReturnType<ReturnType<typeof fakeAuthenticator>["assert"]>,
  { signCount = 0, expected = challenge } = {},
) {
  return verifyAssertion(
    {
      authenticatorData: fromBase64(assertion.authenticatorData),
      clientDataJSON: fromBase64(assertion.clientDataJSON),
      signature: fromBase64(assertion.signature),
    },
    {
      publicKey: fromBase64(authenticator.publicKey),
      algorithm: authenticator.algorithm,
      signCount,
    },
    { challenge: expected, allowedOrigins },
  );
}

describe("verifyAssertion", () => {
  it.each(["ec", "ed25519", "rsa"] as const)("accepts a valid %s assertion", (type) => {
    const authenticator = fakeAuthenticator(type);
    expect(check(authenticator, authenticator.assert(challenge))).toEqual({
      ok: true,
      signCount: 1,
    });
  });

  it("refuses another challenge", () => {
    const authenticator = fakeAuthenticator();
    const result = check(authenticator, authenticator.assert(new Uint8Array(32).fill(8)));
    expect(result).toEqual({ ok: false, reason: "challenge" });
  });

  it("refuses an origin the app isn't served from", () => {
    const authenticator = fakeAuthenticator();
    const assertion = authenticator.assert(challenge, { origin: "https://evil.example" });
    expect(check(authenticator, assertion)).toEqual({ ok: false, reason: "origin" });
  });

  it.each(["http://localhost:3000", "https://localhost:8080", "http://vault.example.com"])(
    "refuses %s: an allowed host on another scheme or port",
    (origin) => {
      const authenticator = fakeAuthenticator();
      const assertion = authenticator.assert(challenge, { origin });
      expect(check(authenticator, assertion)).toEqual({ ok: false, reason: "origin" });
    },
  );

  it("refuses authenticator data for another relying party", () => {
    const authenticator = fakeAuthenticator();
    const assertion = authenticator.assert(challenge, { rpId: "vault.example.com" });
    expect(check(authenticator, assertion)).toEqual({ ok: false, reason: "rp_id" });
  });

  it("requires user verification", () => {
    const authenticator = fakeAuthenticator();
    const assertion = authenticator.assert(challenge, { flags: 0x01 });
    expect(check(authenticator, assertion)).toEqual({ ok: false, reason: "user_verification" });
  });

  it("refuses a signature by another key", () => {
    const authenticator = fakeAuthenticator();
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const assertion = authenticator.assert(challenge, { key: other });
    expect(check(authenticator, assertion)).toEqual({ ok: false, reason: "signature" });
  });

  it("refuses a signature counter that didn't grow (cloned credential)", () => {
    const authenticator = fakeAuthenticator();
    const assertion = authenticator.assert(challenge, { signCount: 5 });
    expect(check(authenticator, assertion, { signCount: 5 })).toEqual({
      ok: false,
      reason: "sign_count",
    });
  });

  it("accepts an authenticator that doesn't count", () => {
    const authenticator = fakeAuthenticator();
    const assertion = authenticator.assert(challenge, { signCount: 0 });
    expect(check(authenticator, assertion)).toEqual({ ok: true, signCount: 0 });
  });
});

describe("credentialKey", () => {
  it("refuses a key that doesn't match its algorithm", () => {
    const ec = fakeAuthenticator("ec");
    expect(credentialKey(fromBase64(ec.publicKey), -7)).toBeDefined();
    expect(credentialKey(fromBase64(ec.publicKey), -257)).toBeUndefined();
    expect(credentialKey(fromBase64(ec.publicKey), -8)).toBeUndefined();
  });

  it("refuses garbage and short RSA keys", () => {
    expect(credentialKey(new Uint8Array(10), -7)).toBeUndefined();
    const short = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey;
    expect(
      credentialKey(new Uint8Array(short.export({ format: "der", type: "spki" })), -257),
    ).toBeUndefined();
  });
});
