import {
  OpaqueClient,
  OpaqueID,
  getOpaqueConfig,
  KE2,
  type AuthClient,
} from "@cloudflare/opaque-ts";
import type { TRPCClient } from "@trpc/client";
import { genSalt } from "@repo/crypto";
import { fromBase64, toBase64 } from "@repo/util";
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

const config = getOpaqueConfig(OpaqueID.OPAQUE_P256);
// Must match OPAQUE_SERVER_IDENTITY on the server (default "passmgr").
const SERVER_IDENTITY = "passmgr";

function bytesToB64(bytes: number[]): string {
  return toBase64(Uint8Array.from(bytes));
}

function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}

export async function loginUser(
  trpc: LoginTRPCClient,
  loginSession: LoginSessionFn,
  email: string,
  password: string,
): Promise<VaultUnlockInfo> {
  const client: AuthClient = new OpaqueClient(config);

  const ke1 = await client.authInit(password);
  if (ke1 instanceof Error) throw new OpaqueLoginFailedError();

  const startLoginRequest = bytesToB64(ke1.serialize());

  let loginResponse: string;
  try {
    ({ loginResponse } = await trpc.login.startLogin.mutate({ email, startLoginRequest }));
  } catch {
    throw new LoginStartFailedError();
  }

  let ke2: KE2;
  try {
    ke2 = KE2.deserialize(config, b64ToBytes(loginResponse));
  } catch {
    throw new OpaqueLoginFailedError();
  }

  const finished = await client.authFinish(ke2, SERVER_IDENTITY, email);
  if (finished instanceof Error) throw new OpaqueLoginFailedError();

  const { ke3, session_key } = finished;
  const finishLoginRequest = bytesToB64(ke3.serialize());
  const sessionKey = bytesToB64(session_key);
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
