import * as opaque from "@serenity-kit/opaque";
import { genKey } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { createCallerFactory } from "../../src/trpc";
import { appRouter } from "../../src/router";
import { buildTestContext } from "../setup/test-context";
import { buildUserKeys } from "../setup/user-keys";
import { deriveAuthKey, signRequest } from "../setup/signed-request";

export const createCaller = createCallerFactory(appRouter);

export async function register(
  email: string,
  password: string,
): Promise<{ recoveryKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
    password,
  });
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest,
  });
  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password,
  });
  const { recoveryKey, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
  return { recoveryKey };
}

export async function loginAndGetAuthKey(
  email: string,
  password: string,
): Promise<{ sessionId: string; authKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });
  const { loginResponse } = await caller.login.startLogin({ email, startLoginRequest });
  const result = opaque.client.finishLogin({ clientLoginState, loginResponse, password });
  if (!result) throw new Error("OPAQUE finishLogin returned null");
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
