import * as opaque from "@serenity-kit/opaque";
import type { TRPCClient } from "@trpc/client";
import { genSalt } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import type { AppRouter } from "@repo/types";
import type { PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";

export type LoginTRPCClient = Pick<TRPCClient<AppRouter>, "login">;

export type LoginSessionFn = (
  sessionId: string,
  sessionKey: string,
  authSalt: Uint8Array<ArrayBuffer>,
) => Promise<void>;

export class LoginStartFailedError extends Error {
  override message = "LoginStartFailedError";
}

export class LoginFinishFailedError extends Error {
  override message = "LoginFinishFailedError";
}

export class OpaqueLoginFailedError extends Error {
  override message = "OpaqueLoginFailedError";
}

/**
 * Drive a full OPAQUE login handshake. On success the session is unlocked via `loginSession`
 * and the VaultUnlockInfo is returned for the (off-main-thread) Argon2id vault unlock step.
 */
export async function loginUser(
  trpc: LoginTRPCClient,
  loginSession: LoginSessionFn,
  email: string,
  password: string,
): Promise<VaultUnlockInfo> {
  const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });

  let loginResponse: string;
  try {
    ({ loginResponse } = await trpc.login.startLogin.mutate({ email, startLoginRequest }));
  } catch {
    throw new LoginStartFailedError();
  }

  const loginResult = opaque.client.finishLogin({
    clientLoginState,
    loginResponse,
    password,
  });

  if (!loginResult) throw new OpaqueLoginFailedError();

  const { finishLoginRequest, sessionKey } = loginResult;
  const authSalt = genSalt();

  let sessionId: string;
  let userPasswordKeys: PasswordKeySchema;
  try {
    ({ sessionId, userPasswordKeys } = await trpc.login.finishLogin.mutate({
      email,
      finishLoginRequest,
      authSalt: toBase64(authSalt),
    }));
  } catch {
    throw new LoginFinishFailedError();
  }

  await loginSession(sessionId, sessionKey, authSalt);

  return { email, password, userPasswordKeys };
}
