import { genKey } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { createCallerFactory } from "../../src/trpc";
import { appRouter } from "../../src/router";
import { buildTestContext } from "../setup/test-context";
import { buildUserKeys } from "../setup/user-keys";
import { deriveAuthKey, signRequest } from "../setup/signed-request";
import { clientStartLogin, clientStartRegistration } from "../setup/opaque-client";

export const createCaller = createCallerFactory(appRouter);

export async function register(
  email: string,
  password: string,
): Promise<{ recoveryKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
  const { recoveryKey, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
  return { recoveryKey };
}

export async function loginAndGetAuthKey(
  email: string,
  password: string,
): Promise<{ sessionId: string; authKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartLogin(password);
  const { loginResponse } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse, email);
  if (!result) throw new Error("OPAQUE authFinish failed");
  const authSalt = genKey();
  const finished = await caller.login.finishLogin({
    email,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: toBase64(authSalt),
  });
  const authKey = await deriveAuthKey(result.sessionKey, authSalt);
  return { sessionId: finished.sessionId, authKey };
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
