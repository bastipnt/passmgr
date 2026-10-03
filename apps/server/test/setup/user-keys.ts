import { createUserKeyPair, createVault, generateUserKeys, genKey } from "@repo/crypto";

/** A key set wrapping `accountKey` (a fresh one by default), as the client builds it. */
export function buildUserKeys(password: string, accountKey: Uint8Array = genKey()) {
  return generateUserKeys(password, accountKey);
}

/** Everything the client sends at registration (mirrors packages/client/src/register.ts). */
export async function buildRegistrationKeys(password: string) {
  const accountKey = genKey();
  const { recoveryKey, ...userKeys } = await generateUserKeys(password, accountKey);
  return {
    accountKey,
    recoveryKey,
    userKeys,
    personalVault: createVault(accountKey, { name: "Personal" }),
    userKeyPair: createUserKeyPair(accountKey),
  };
}
