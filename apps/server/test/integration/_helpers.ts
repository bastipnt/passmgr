import { genKey } from "@repo/crypto";
import type { MemberVault, PasswordKeySchema, RecoveryWrapSchema, UserKeyPair } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/trpc";
import { clientStartLogin, clientStartRegistration } from "../setup/opaque-client";
import { deriveAuthKey, signRequest } from "../setup/signed-request";
import { buildTestContext } from "../setup/test-context";
import { buildRegistrationKeys } from "../setup/user-keys";

export const createCaller = createCallerFactory(appRouter);

export async function register(
  email: string,
  password: string,
): Promise<{ recoveryKey: Uint8Array; accountKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(password, email);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse);
  const { recoveryKey, accountKey, userKeys, personalVault, userKeyPair } =
    await buildRegistrationKeys(password);
  await caller.register.finishRegistration({
    email,
    registrationRecord,
    userKeys,
    personalVault,
    userKeyPair,
  });
  return { recoveryKey, accountKey };
}

/**
 * An OPAQUE login. For an account with two-factor on, `secondFactorCode` gives
 * the code for the second step (without it, such a login throws).
 */
export async function loginAndGetAuthKey(
  email: string,
  password: string,
  deviceName?: string,
  secondFactorCode?: () => Promise<string>,
): Promise<{
  sessionId: string;
  authKey: Uint8Array;
  vaultKeys: MemberVault[];
  userKeyPair: UserKeyPair;
  userPasswordKeys: PasswordKeySchema;
  recoveryKeys: RecoveryWrapSchema | null;
}> {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartLogin(password, email);
  const { loginResponse, attemptId } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse);
  if (!result) throw new Error("OPAQUE authFinish failed");
  const authSalt = genKey();
  const finishCaller = createCaller(buildTestContext(undefined, deviceName));
  let finished = await finishCaller.login.finishLogin({
    email,
    attemptId,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: toBase64(authSalt),
  });
  if ("secondFactorRequired" in finished) {
    if (!secondFactorCode) throw new Error("second factor required");
    finished = await finishCaller.login.verifySecondFactor({
      challengeId: finished.challengeId,
      code: await secondFactorCode(),
    });
  }
  const authKey = await deriveAuthKey(result.sessionKey, authSalt);
  return {
    sessionId: finished.sessionId,
    authKey,
    vaultKeys: finished.vaultKeys,
    userKeyPair: finished.userKeyPair,
    userPasswordKeys: finished.userPasswordKeys,
    recoveryKeys: finished.recoveryKeys,
  };
}

export async function callSigned(
  sessionId: string,
  authKey: Uint8Array,
  type: "mutation" | "query",
  path: string,
  input: Record<string, unknown> | string | undefined,
) {
  const headers = await signRequest({ authKey, sessionId, type, path, input });
  return createCaller(buildTestContext(headers));
}

/** A `record.push` change writing new ciphertext on top of `baseVersion` (0: a new record). */
export function putChange(
  vaultId: string,
  { recordId = crypto.randomUUID(), baseVersion = 0, data = "ENC", keyVersion = 1 } = {},
) {
  return {
    op: "put" as const,
    clientChangeId: crypto.randomUUID(),
    recordId,
    vaultId,
    baseVersion,
    encryptedData: data,
    encryptionNonce: "NONCE",
    cryptoVersion: 1,
    keyVersion,
    clientUpdatedAt: new Date().toISOString(),
  };
}

/** A `record.push` change tombstoning the record on top of `baseVersion`. */
export function deleteChange(vaultId: string, recordId: string, baseVersion: number) {
  return {
    op: "delete" as const,
    clientChangeId: crypto.randomUUID(),
    recordId,
    vaultId,
    baseVersion,
    clientUpdatedAt: new Date().toISOString(),
  };
}
