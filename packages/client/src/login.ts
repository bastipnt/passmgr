import { type AuthClient, KE2, OpaqueClient } from "@cloudflare/opaque-ts";
import { genSalt, normalizeEmail } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import type { MemberVaultKey, PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import type { AppRouter } from "@repo/types";
import { toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import {
  b64ToBytes,
  bytesToB64,
  opaqueConfig as config,
  isThrottled,
  SERVER_IDENTITY,
} from "./opaque";
import { timed } from "./util/perf";

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

/** Too many login attempts for this account (or from this IP) — retry later. */
export class LoginThrottledError extends Error {
  override message = "LoginThrottledError";
}

export async function loginUser(
  trpc: LoginTRPCClient,
  loginSession: LoginSessionFn,
  rawEmail: string,
  password: string,
): Promise<VaultUnlockInfo> {
  const email = normalizeEmail(rawEmail);
  const client: AuthClient = new OpaqueClient(config, opaqueKsf);

  const ke1 = await timed("opaque client.authInit (P256)", () => client.authInit(password));
  if (ke1 instanceof Error) throw new OpaqueLoginFailedError();

  const startLoginRequest = bytesToB64(ke1.serialize());

  let loginResponse: string;
  let attemptId: string;
  try {
    ({ loginResponse, attemptId } = await timed("opaque startLogin", () =>
      trpc.login.startLogin.mutate({ email, startLoginRequest }),
    ));
  } catch (err) {
    if (isThrottled(err)) throw new LoginThrottledError();
    throw new LoginStartFailedError();
  }

  let ke2: KE2;
  try {
    ke2 = KE2.deserialize(config, b64ToBytes(loginResponse));
  } catch {
    throw new OpaqueLoginFailedError();
  }

  const finished = await timed("opaque client.authFinish (P256)", () =>
    client.authFinish(ke2, SERVER_IDENTITY, email),
  );
  if (finished instanceof Error) throw new OpaqueLoginFailedError();

  const { ke3, session_key } = finished;
  const finishLoginRequest = bytesToB64(ke3.serialize());
  const sessionKey = bytesToB64(session_key);
  const authSalt = genSalt();

  let sessionId: string;
  let userPasswordKeys: PasswordKeySchema;
  let vaultKeys: MemberVaultKey[];
  try {
    ({ sessionId, userPasswordKeys, vaultKeys } = await timed("opaque finishLogin", () =>
      trpc.login.finishLogin.mutate({
        email,
        attemptId,
        finishLoginRequest,
        authSalt: toBase64(authSalt),
      }),
    ));
  } catch {
    throw new LoginFinishFailedError();
  }

  await loginSession(sessionId, sessionKey, authSalt);

  return { email, password, userPasswordKeys, vaultKeys };
}
