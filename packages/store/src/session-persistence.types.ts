/**
 * Material persisted to OS-backed secure storage so a logged-in + unlocked
 * session can be restored on app reopen without re-running OPAQUE/Argon2.
 *
 * Everything here is base64. The user's password is deliberately NOT included —
 * we persist the derived `authKey` (an HMAC session key) and the `vaultKey`,
 * both behind the OS secure enclave.
 */
export type LoginBundle = {
  sessionId: string;
  authKeyB64: string;
  authSaltB64: string;
  vaultKeyB64: string;
  email: string;
};
