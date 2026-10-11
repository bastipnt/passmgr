import { createGuardrails } from "@otplib/core";
import { generate, generateSecret, generateURI, verify } from "otplib";

const guardrails = createGuardrails({
  MIN_SECRET_BYTES: 10,
});

export async function getToken(secret: string | Uint8Array) {
  return await generate({ secret: secret, guardrails });
}

export { getRemainingTime } from "@otplib/totp";

/** Seconds of one TOTP step (RFC 6238 default; what authenticator apps assume). */
const TOTP_PERIOD_SECONDS = 30;

/** A new random TOTP secret (20 bytes, base32), for a second factor. */
export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

/** The `otpauth://` URI an authenticator app enrolls `secret` from (QR code or link). */
export function totpUri(secret: string, issuer: string, label: string): string {
  return generateURI({ issuer, label, secret });
}

/**
 * Check a 6-digit TOTP `code` against `secret`, accepting the step before and
 * after the current one (clock drift). A step at or below `lastStep` (the last
 * one accepted) is refused, so a code is good for one login only.
 *
 * @returns the step the code belongs to (store it as the next `lastStep`), or
 *   null when the code is wrong, replayed or not 6 digits
 */
export async function verifyToken(
  secret: string,
  code: string,
  lastStep: number | null,
): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const result = await verify({
      secret,
      token: code,
      guardrails,
      epochTolerance: TOTP_PERIOD_SECONDS,
      ...(lastStep === null ? {} : { afterTimeStep: lastStep }),
    });
    return result.valid && "timeStep" in result ? result.timeStep : null;
  } catch {
    // otplib throws for an `afterTimeStep` past the window (clock went back).
    return null;
  }
}
