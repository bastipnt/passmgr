import { type AuthClient, KE2, OpaqueClient } from "@cloudflare/opaque-ts";
import {
  type DeviceAssertion,
  deriveOpaquePassword,
  deviceLoginChallenge,
  deviceSessionKey,
  generateDeviceLoginKeyPair,
  genSalt,
  normalizeEmail,
  wipe,
} from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import {
  type LoginSuccess,
  SECOND_FACTOR_EXPIRED,
  SECOND_FACTOR_INVALID,
  type VaultUnlockInfo,
} from "@repo/schema";
import type { AppRouter } from "@repo/types";
import { fromBase64, toBase64 } from "@repo/util";
import { type TRPCClient, TRPCClientError } from "@trpc/client";
import {
  b64ToBytes,
  bytesToB64,
  opaqueConfig as config,
  opaqueInput,
  SERVER_IDENTITY,
} from "./opaque";
import { timed } from "./util/perf";
import { isServerAnswer, isServerError, isThrottled, isUnauthorized } from "./util/trpc-errors";

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

/** The server refused the device credential (removed, or the assertion didn't verify). */
export class DeviceLoginRejectedError extends Error {
  override message = "DeviceLoginRejectedError";
}

/** Too many login attempts for this account (or from this IP) — retry later. */
export class LoginThrottledError extends Error {
  override message = "LoginThrottledError";
}

/** The request didn't get through, or the server failed on its side: retry later. */
export class LoginUnreachableError extends Error {
  override message = "LoginUnreachableError";
}

/** The user closed the second-factor prompt: no session. */
export class SecondFactorCancelledError extends Error {
  override message = "SecondFactorCancelledError";
}

/**
 * The second-factor challenge is gone (expired, or too many wrong codes): the
 * login has to start over with the password.
 */
export class SecondFactorExpiredError extends Error {
  override message = "SecondFactorExpiredError";
}

/**
 * Asks the user for a second-factor code (TOTP or backup code) when the
 * account has two-factor on. `invalid`: the last code was wrong. Resolves the
 * code, or null when the user cancels. `done` is called once the login is
 * past the code step (it passed, or failed for good): the prompt can close.
 */
export type SecondFactorPrompt = {
  (state: { invalid: boolean }): Promise<string | null>;
  done?: () => void;
};

/** For logins that can't ask (a brand-new account never has two-factor on). */
export const noSecondFactor: SecondFactorPrompt = async () => null;

/**
 * The OPAQUE login. When the account has two-factor on, `onSecondFactor` is
 * asked for a code (again after a wrong one) before there is a session; it is
 * never called otherwise.
 *
 * Throws `OpaqueLoginFailedError` (wrong password or unknown email),
 * `LoginThrottledError`, `LoginUnreachableError`, `SecondFactorCancelledError`,
 * `SecondFactorExpiredError`, `LoginStartFailedError` or
 * `LoginFinishFailedError` (the server refused a step; a request that didn't
 * get through or hit a 5xx is `LoginUnreachableError` instead).
 */
export async function loginUser(
  trpc: LoginTRPCClient,
  loginSession: LoginSessionFn,
  rawEmail: string,
  password: string,
  onSecondFactor: SecondFactorPrompt = noSecondFactor,
): Promise<VaultUnlockInfo> {
  const opaquePassword = await deriveOpaquePassword(password, rawEmail);
  try {
    const login = await loginWithOpaquePassword(
      trpc,
      loginSession,
      rawEmail,
      opaquePassword,
      onSecondFactor,
    );
    return { ...login, password };
  } finally {
    wipe(opaquePassword);
  }
}

export type AccountLogin = Omit<VaultUnlockInfo, "password">;

/** `loginUser` with the password already derived (`deriveOpaquePassword`). Same errors. */
export async function loginWithOpaquePassword(
  trpc: LoginTRPCClient,
  loginSession: LoginSessionFn,
  rawEmail: string,
  opaquePassword: Uint8Array,
  onSecondFactor: SecondFactorPrompt = noSecondFactor,
): Promise<AccountLogin> {
  const email = normalizeEmail(rawEmail);
  const client: AuthClient = new OpaqueClient(config, opaqueKsf);

  const ke1 = await timed("opaque client.authInit (P256)", () =>
    client.authInit(opaqueInput(opaquePassword)),
  );
  if (ke1 instanceof Error) throw new OpaqueLoginFailedError();

  const startLoginRequest = bytesToB64(ke1.serialize());

  let loginResponse: string;
  let attemptId: string;
  try {
    ({ loginResponse, attemptId } = await timed("opaque startLogin", () =>
      trpc.login.startLogin.mutate({ email, startLoginRequest }),
    ));
  } catch (err) {
    throw requestFailure(err, LoginStartFailedError);
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

  let finishedLogin: Awaited<ReturnType<LoginTRPCClient["login"]["finishLogin"]["mutate"]>>;
  try {
    finishedLogin = await timed("opaque finishLogin", () =>
      trpc.login.finishLogin.mutate({
        email,
        attemptId,
        finishLoginRequest,
        authSalt: toBase64(authSalt),
      }),
    );
  } catch (err) {
    throw requestFailure(err, LoginFinishFailedError);
  }

  const { sessionId, userId, userPasswordKeys, vaultKeys, userKeyPair } =
    "secondFactorRequired" in finishedLogin
      ? await passSecondFactor(trpc, finishedLogin.challengeId, onSecondFactor)
      : finishedLogin;

  await loginSession(sessionId, sessionKey, authSalt);

  return { email, userId, userPasswordKeys, vaultKeys, userKeyPair };
}

/**
 * A device login waiting for its WebAuthn assertion: sign `challenge` with the
 * device credential (`authenticateBiometric`), then `finish`. Single use, and
 * the server drops it after five minutes.
 */
export type PendingDeviceLogin = {
  challenge: Uint8Array;
  startedAt: number;
  finish: (
    assertion: DeviceAssertion,
    loginSession: LoginSessionFn,
    email: string,
    onSecondFactor?: SecondFactorPrompt,
  ) => Promise<AccountLogin>;
  /** Drop a login that won't be finished (wipes its key); a no-op after `finish`. */
  discard: () => void;
};

/**
 * Start a login with the device credential behind the biometric unlock
 * (`login.startDeviceLogin`). The session key comes from an X25519 agreement
 * whose keys the signed challenge covers. Throws like `loginWithOpaquePassword`;
 * a credential or assertion the server refuses is `DeviceLoginRejectedError`.
 */
export async function startDeviceLogin(
  trpc: LoginTRPCClient,
  credentialId: string,
): Promise<PendingDeviceLogin> {
  let started: Awaited<ReturnType<LoginTRPCClient["login"]["startDeviceLogin"]["mutate"]>>;
  try {
    started = await trpc.login.startDeviceLogin.mutate({ credentialId });
  } catch (err) {
    throw requestFailure(err, DeviceLoginRejectedError);
  }
  const { privateKey, publicKey } = generateDeviceLoginKeyPair();
  const serverPublicKey = fromBase64(started.serverPublicKey);
  const challenge = deviceLoginChallenge(fromBase64(started.nonce), serverPublicKey, publicKey);

  let used = false;
  function discard() {
    used = true;
    wipe(privateKey);
  }

  async function finish(
    assertion: DeviceAssertion,
    loginSession: LoginSessionFn,
    email: string,
    onSecondFactor: SecondFactorPrompt = noSecondFactor,
  ): Promise<AccountLogin> {
    if (used) throw new DeviceLoginRejectedError();
    let sessionKey: string;
    try {
      sessionKey = await deviceSessionKey(privateKey, serverPublicKey, challenge);
    } finally {
      discard();
    }
    const authSalt = genSalt();

    let finished: Awaited<ReturnType<LoginTRPCClient["login"]["finishDeviceLogin"]["mutate"]>>;
    try {
      finished = await trpc.login.finishDeviceLogin.mutate({
        attemptId: started.attemptId,
        clientPublicKey: toBase64(publicKey),
        ...assertion,
        authSalt: toBase64(authSalt),
      });
    } catch (err) {
      throw requestFailure(err, DeviceLoginRejectedError);
    }

    const { sessionId, userId, userPasswordKeys, vaultKeys, userKeyPair } =
      "secondFactorRequired" in finished
        ? await passSecondFactor(trpc, finished.challengeId, onSecondFactor)
        : finished;
    await loginSession(sessionId, sessionKey, authSalt);
    return { email: normalizeEmail(email), userId, userPasswordKeys, vaultKeys, userKeyPair };
  }

  return { challenge, startedAt: Date.now(), finish, discard };
}

/** Ask for codes until one is right, the user cancels or the challenge is gone. */
async function passSecondFactor(
  trpc: LoginTRPCClient,
  challengeId: string,
  onSecondFactor: SecondFactorPrompt,
): Promise<LoginSuccess> {
  try {
    return await askUntilVerified(trpc, challengeId, onSecondFactor);
  } finally {
    onSecondFactor.done?.();
  }
}

async function askUntilVerified(
  trpc: LoginTRPCClient,
  challengeId: string,
  onSecondFactor: SecondFactorPrompt,
): Promise<LoginSuccess> {
  let invalid = false;
  for (;;) {
    const code = await onSecondFactor({ invalid });
    if (code === null) throw new SecondFactorCancelledError();
    try {
      return await trpc.login.verifySecondFactor.mutate({ challengeId, code });
    } catch (err) {
      if (isUnauthorized(err) && err instanceof TRPCClientError) {
        if (err.message === SECOND_FACTOR_INVALID) {
          invalid = true;
          continue;
        }
        if (err.message === SECOND_FACTOR_EXPIRED) throw new SecondFactorExpiredError();
      }
      throw requestFailure(err, LoginFinishFailedError);
    }
  }
}

function requestFailure(err: unknown, Rejected: new () => Error): Error {
  if (isThrottled(err)) return new LoginThrottledError();
  if (!isServerAnswer(err) || isServerError(err)) return new LoginUnreachableError();
  return new Rejected();
}
