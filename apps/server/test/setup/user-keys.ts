import { createKeyring, generateUserKeys, genKey } from "@repo/crypto";

/** A key set wrapping `accountKey` (a fresh one by default), as the client builds it. */
export function buildUserKeys(password: string, accountKey: Uint8Array = genKey()) {
  return generateUserKeys(password, accountKey);
}

/** Everything the client sends at registration: `createKeyring`, as its `generateKeyring`. */
export function buildRegistrationKeys(password: string) {
  return createKeyring(password);
}
