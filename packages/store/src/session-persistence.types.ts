/**
 * The live server session, as persisted next to the account key (linked
 * profiles only): the derived `authKey` (an HMAC session key), never the
 * password.
 */
export type ServerSessionBundle = {
  sessionId: string;
  authKeyB64: string;
  authSaltB64: string;
};

/**
 * Material persisted to OS-backed secure storage so an unlocked vault (and, for
 * a linked profile, its server session) can be restored on app reopen without
 * re-running Argon2 or OPAQUE.
 *
 * Everything here is base64 and sits behind the OS secure enclave. The user's
 * password is deliberately NOT included. Vault keys are re-unwrapped from the
 * local database with the account key; whose account it is comes from the
 * local profile.
 */
export type LoginBundle = {
  accountKeyB64: string;
  /** Absent in `local` mode, and once the server session is gone. */
  server?: ServerSessionBundle;
};
