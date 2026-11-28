import { normalizeEmail, wipe } from "@repo/crypto";
import type { AccountKeyMaterial } from "@repo/schema";
import { secretsStore } from "@repo/store";
import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";
import {
  type LoginSessionFn,
  LoginThrottledError,
  type LoginTRPCClient,
  loginUser,
  noSecondFactor,
  OpaqueLoginFailedError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../login";
import { opaqueInputFor, registerOpaque } from "../opaque";
import { unwrapAccountKeyWithPassword } from "../util/derive-password-kek";
import { endServerSession } from "../util/end-server-session";
import { isServerAnswer, isThrottled } from "../util/trpc-errors";
import { HeldSession } from "./held-session";
import { wrapAccountKeyForPassword } from "./rekey-password-keys";

export type PasswordChangeTRPCClient = Pick<TRPCClient<AppRouter>, "login" | "user">;

/** The current password is wrong. */
export class WrongPasswordError extends Error {
  override message = "WrongPasswordError";
}

/** The server couldn't be reached or refused the change; nothing changed on it. */
export class PasswordChangeFailedError extends Error {
  override message = "PasswordChangeFailedError";
}

/**
 * The change was sent, but no answer came back (network): the server may have
 * taken it. Only a login can tell; `material` is the wrap it holds if it did.
 */
export class PasswordChangeUnconfirmedError extends Error {
  override message = "PasswordChangeUnconfirmedError";
  readonly material: AccountKeyMaterial;

  constructor(material: AccountKeyMaterial) {
    super();
    this.material = material;
  }
}

/** Whether `password` opens the stored password wrap of the account key. */
export async function opensPasswordWrap(
  password: string,
  material: AccountKeyMaterial,
): Promise<boolean> {
  try {
    wipe(await unwrapAccountKeyWithPassword(password, material));
    return true;
  } catch {
    return false;
  }
}

/**
 * Change the master password of a `local` profile (ADR 0001 D10): the device
 * holds the only key set, so this is a rewrap of the unlocked account key
 * under the new password. The recovery wrap, the vault keys and the keypair
 * stay as they are. Needs the unlocked vault.
 *
 * Throws `WrongPasswordError` when `currentPassword` doesn't open `material`.
 * @returns the material to store in place of `material`
 */
export async function changeLocalPassword(
  material: AccountKeyMaterial,
  currentPassword: string,
  newPassword: string,
): Promise<AccountKeyMaterial> {
  if (!(await opensPasswordWrap(currentPassword, material))) throw new WrongPasswordError();
  const passwordWrap = await wrapAccountKeyForPassword(newPassword);
  return { ...passwordWrap, userKeyPair: material.userKeyPair };
}

/**
 * The fresh login's session is attached only once it is known to be `account.userId`'s; the flow:
 * see docs/architecture/auth.md (Password change).
 *
 * Throws `WrongPasswordError`, `LoginThrottledError`, a second-factor error
 * (see `freshLogin`), `PasswordChangeFailedError` (nothing changed on the server) or
 * `PasswordChangeUnconfirmedError` (the last request got no answer: the server
 * may have taken it).
 *
 * `beforeLogin` runs before the fresh login, which ends the current session: from there on the
 * session may be ended or revoked (`finishPasswordChange` revokes every one).
 *
 * @returns the material to store in place of `material`
 */
export async function changeAccountPassword(
  trpc: PasswordChangeTRPCClient,
  attach: LoginSessionFn,
  account: { email: string; userId: string },
  material: AccountKeyMaterial,
  currentPassword: string,
  newPassword: string,
  onSecondFactor?: SecondFactorPrompt,
  beforeLogin: () => Promise<void> = async () => {},
): Promise<AccountKeyMaterial> {
  const email = normalizeEmail(account.email);
  await beforeLogin();
  await freshLogin(
    trpc,
    attach,
    { ...account, email },
    currentPassword,
    PasswordChangeFailedError,
    onSecondFactor,
  );

  const {
    reply: { attemptId },
    registrationRecord,
  } = await registerOpaque(
    await opaqueInputFor(newPassword, email),
    email,
    (registrationRequest) =>
      callServer(() => trpc.user.startPasswordChange.mutate({ email, registrationRequest })),
    () => new PasswordChangeFailedError(),
  );

  const passwordKeys = await wrapAccountKeyForPassword(newPassword);
  const changed = { ...passwordKeys, userKeyPair: material.userKeyPair };
  try {
    await trpc.user.finishPasswordChange.mutate({
      attemptId,
      registrationRecord,
      passwordKeys,
    });
  } catch (e) {
    if (isThrottled(e)) throw new LoginThrottledError();
    if (!isServerAnswer(e)) throw new PasswordChangeUnconfirmedError(changed);
    throw new PasswordChangeFailedError();
  }

  return changed;
}

/**
 * A fresh OPAQUE login with the account's password (the server's proof that it
 * is still known, `freshAuthProcedure`). Its session is attached with
 * `attach` once it is known to be `account.userId`'s; the session it replaces
 * is ended first (best-effort), so a change that fails later leaves none behind.
 *
 * With two-factor on, `onSecondFactor` is asked for a code.
 *
 * Throws `WrongPasswordError`, `LoginThrottledError`,
 * `SecondFactorCancelledError`, `SecondFactorExpiredError` or `failed` (the
 * server couldn't be reached, or the email now belongs to another account).
 */
export async function freshLogin(
  trpc: LoginTRPCClient,
  attach: LoginSessionFn,
  account: { email: string; userId: string },
  password: string,
  failed: new () => Error,
  onSecondFactor: SecondFactorPrompt = noSecondFactor,
): Promise<void> {
  const session = new HeldSession();
  try {
    try {
      const info = await loginUser(trpc, session.hold, account.email, password, onSecondFactor);
      // The email now belongs to another account: never touch it.
      if (info.userId !== account.userId || !session.isHeld) throw new failed();
    } catch (e) {
      if (e instanceof OpaqueLoginFailedError) throw new WrongPasswordError();
      if (
        e instanceof LoginThrottledError ||
        e instanceof SecondFactorCancelledError ||
        e instanceof SecondFactorExpiredError ||
        e instanceof failed
      )
        throw e;
      throw new failed();
    }
    if (secretsStore.hasServerSession) {
      await endServerSession(trpc);
      // Ended on the server: an attach that throws below must not leave it to be persisted.
      secretsStore.detachServer();
    }
    await session.attach(attach);
  } finally {
    session.release();
  }
}

async function callServer<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (isThrottled(e)) throw new LoginThrottledError();
    throw new PasswordChangeFailedError();
  }
}
