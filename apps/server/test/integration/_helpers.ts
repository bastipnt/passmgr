import { genKey } from "@repo/crypto";
import type { MemberVault, UserKeyPair } from "@repo/schema";
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
  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
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

export async function loginAndGetAuthKey(
  email: string,
  password: string,
): Promise<{
  sessionId: string;
  authKey: Uint8Array;
  vaultKeys: MemberVault[];
  userKeyPair: UserKeyPair;
}> {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartLogin(password);
  const { loginResponse, attemptId } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse, email);
  if (!result) throw new Error("OPAQUE authFinish failed");
  const authSalt = genKey();
  const finished = await caller.login.finishLogin({
    email,
    attemptId,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: toBase64(authSalt),
  });
  const authKey = await deriveAuthKey(result.sessionKey, authSalt);
  return {
    sessionId: finished.sessionId,
    authKey,
    vaultKeys: finished.vaultKeys,
    userKeyPair: finished.userKeyPair,
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
