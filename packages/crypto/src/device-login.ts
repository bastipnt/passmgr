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
 * The session key of a device login: base64, like OPAQUE's, so the session
 * and auth keys derive from it the same way (`secretsStore.unlockSession`).
 */
export async function deviceSessionKey(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  challenge: Uint8Array,
): Promise<string> {
  const shared = x25519.getSharedSecret(privateKey, peerPublicKey);
  try {
    const key = await hkdf(shared, "deviceSessionKey", challenge);
    const encoded = toBase64(key);
    wipe(key);
    return encoded;
  } finally {
    wipe(shared);
  }
}
