import { RegistrationRecord } from "@cloudflare/opaque-ts";
import { hkdf, normalizeEmail, signHmac } from "@repo/crypto";
import { opaqueConfig, serverKey } from "../opaque";

/**
 * Stand-in registration record for emails with no account, so `startLogin`
 * answers unknown users with a well-formed KE2 instead of UNAUTHORIZED
 * (RFC 9807 §10.9, client enumeration). Mirrors `RegistrationRecord.createFake`,
 * but derived from a server secret + the email instead of fresh randomness,
 * so repeated probes for the same email return consistent-looking responses.
 * The client's `authFinish` then fails exactly like a wrong password.
 */
export async function fakeRegistrationRecord(email: string): Promise<RegistrationRecord> {
  const fakeRecordKey = await hkdf(serverKey, "opaqueFakeRecordKey");
  const emailSecret = await signHmac(fakeRecordKey, normalizeEmail(email));

  const keySeed = await hkdf(emailSecret, "opaqueFakeKeySeed");
  const maskingKey = await hkdf(emailSecret, "opaqueFakeMaskingKey");
  if (
    keySeed.length !== opaqueConfig.constants.Nseed ||
    maskingKey.length !== opaqueConfig.hash.Nh
  ) {
    throw new Error("fake record: key size mismatch with OPAQUE config");
  }

  const { public_key } = await opaqueConfig.ake.deriveAuthKeyPair(keySeed);

  // `Envelope` isn't exported; like createFake, use an all-zero envelope
  // (it only ever travels encrypted under the masking key).
  const envelopeSize =
    RegistrationRecord.sizeSerialized(opaqueConfig) - public_key.length - maskingKey.length;
  return RegistrationRecord.deserialize(opaqueConfig, [
    ...public_key,
    ...maskingKey,
    ...new Array<number>(envelopeSize).fill(0),
  ]);
}
