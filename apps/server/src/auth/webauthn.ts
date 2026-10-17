import { createHash, createPublicKey, type KeyObject, verify } from "node:crypto";

const COSE_ES256 = -7;
const COSE_EDDSA = -8;
const COSE_RS256 = -257;

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const AUTH_DATA_MIN_LENGTH = 37;

export type StoredCredential = {
  publicKey: Uint8Array;
  algorithm: number;
  signCount: number;
};

export type Assertion = {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
};

export type AssertionResult = { ok: true; signCount: number } | { ok: false; reason: string };

/**
 * The credential's public key, when it is of the type its algorithm names
 * (P-256 for ES256, Ed25519 for EdDSA, RSA for RS256). Undefined otherwise.
 */
export function credentialKey(publicKey: Uint8Array, algorithm: number): KeyObject | undefined {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: Buffer.from(publicKey), format: "der", type: "spki" });
  } catch {
    return undefined;
  }
  const { asymmetricKeyType: type, asymmetricKeyDetails: details } = key;
  if (algorithm === COSE_ES256 && type === "ec" && details?.namedCurve === "prime256v1") return key;
  if (algorithm === COSE_EDDSA && type === "ed25519") return key;
  if (algorithm === COSE_RS256 && type === "rsa" && (details?.modulusLength ?? 0) >= 2048)
    return key;
  return undefined;
}

/**
 * Checks a WebAuthn assertion (`navigator.credentials.get`) against a stored
 * credential: the expected challenge, an allowed origin whose host is the
 * relying party, user presence and verification (the biometric), the
 * signature and a growing signature counter.
 */
export function verifyAssertion(
  assertion: Assertion,
  credential: StoredCredential,
  expected: { challenge: Uint8Array; allowedOrigins: ReadonlySet<string> },
): AssertionResult {
  const { authenticatorData, clientDataJSON, signature } = assertion;

  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
  try {
    clientData = JSON.parse(Buffer.from(clientDataJSON).toString("utf8"));
  } catch {
    return { ok: false, reason: "client_data" };
  }
  if (clientData.type !== "webauthn.get") return { ok: false, reason: "type" };
  if (clientData.challenge !== Buffer.from(expected.challenge).toString("base64url"))
    return { ok: false, reason: "challenge" };
  if (clientData.crossOrigin === true) return { ok: false, reason: "cross_origin" };

  if (typeof clientData.origin !== "string" || !expected.allowedOrigins.has(clientData.origin))
    return { ok: false, reason: "origin" };
  const rpId = new URL(clientData.origin).hostname;

  if (authenticatorData.length < AUTH_DATA_MIN_LENGTH) return { ok: false, reason: "auth_data" };
  const authData = Buffer.from(authenticatorData);
  const rpIdHash = createHash("sha256").update(rpId).digest();
  if (!authData.subarray(0, 32).equals(rpIdHash)) return { ok: false, reason: "rp_id" };
  const flags = authData[32] ?? 0;
  if (!(flags & FLAG_USER_PRESENT) || !(flags & FLAG_USER_VERIFIED))
    return { ok: false, reason: "user_verification" };
  const signCount = authData.readUInt32BE(33);

  const key = credentialKey(credential.publicKey, credential.algorithm);
  if (!key) return { ok: false, reason: "key" };
  const signed = Buffer.concat([
    authData,
    createHash("sha256").update(Buffer.from(clientDataJSON)).digest(),
  ]);
  let valid: boolean;
  try {
    valid = verify(
      credential.algorithm === COSE_EDDSA ? null : "sha256",
      signed,
      key,
      Buffer.from(signature),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };

  // Platform authenticators may not count at all (always 0).
  if ((signCount !== 0 || credential.signCount !== 0) && signCount <= credential.signCount)
    return { ok: false, reason: "sign_count" };

  return { ok: true, signCount };
}
