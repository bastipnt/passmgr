/**
 * Material persisted to OS-backed secure storage so a logged-in + unlocked
 * session can be restored on app reopen without re-running OPAQUE/Argon2.
 *
 * Everything here is base64. The user's password is deliberately NOT included —
 * we persist the derived `authKey` (an HMAC session key) and the `accountKey`,
 * both behind the OS secure enclave. Vault keys are re-unwrapped from the local
 * database with the account key.
 */
export type LoginBundle = {
  sessionId: string;
  authKeyB64: string;
  authSaltB64: string;
  accountKeyB64: string;
  email: string;
};
