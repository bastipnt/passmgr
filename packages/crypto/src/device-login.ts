import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { fromString, toBase64 } from "@repo/util";
import { hkdf } from "./hash";
import { genKey, wipe } from "./util/secrets-utils";

const CHALLENGE_DOMAIN = fromString("passmgr/device-login/v1");

/** An ephemeral X25519 key pair for one device login. */
export function generateDeviceLoginKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = genKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

/**
 * The WebAuthn challenge of a device login. It covers both ephemeral keys, so
 * the authenticator's signature vouches for the key agreement, not only for
 * the server's nonce.
 */
export function deviceLoginChallenge(
  nonce: Uint8Array,
  serverPublicKey: Uint8Array,
  clientPublicKey: Uint8Array,
): Uint8Array {
  return sha256(concatBytes(CHALLENGE_DOMAIN, nonce, serverPublicKey, clientPublicKey));
}

/**
 * The session key of a device login, as bytes (the client keeps it so up to
 * `secretsStore.unlockSession`, which wipes it). The session and auth keys
 * derive from it like from OPAQUE's (`deriveSessionSecret`).
 */
export async function deviceSessionKeyBytes(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  challenge: Uint8Array,
): Promise<Uint8Array> {
  const shared = x25519.getSharedSecret(privateKey, peerPublicKey);
  try {
    return await hkdf(shared, "deviceSessionKey", challenge);
  } finally {
    wipe(shared);
  }
}

/** `deviceSessionKeyBytes` as base64, the server's form. */
export async function deviceSessionKey(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  challenge: Uint8Array,
): Promise<string> {
  const key = await deviceSessionKeyBytes(privateKey, peerPublicKey, challenge);
  try {
    return toBase64(key);
  } finally {
    wipe(key);
  }
}
