import { OpaqueClient, type RegistrationClient, RegistrationResponse } from "@cloudflare/opaque-ts";
import { normalizeEmail, unwrapAccountKey, wipe } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import type { AccountKeyMaterial } from "@repo/schema";
import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";
import {
  type LoginSessionFn,
  LoginThrottledError,
  loginUser,
  OpaqueLoginFailedError,
} from "../login";
import { b64ToBytes, bytesToB64, opaqueConfig as config, SERVER_IDENTITY } from "../opaque";
import { derivePasswordKek } from "../util/derive-password-kek";
import { isServerAnswer, isThrottled } from "../util/trpc-errors";
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
  let passwordKek: Uint8Array | undefined;
  try {
    passwordKek = await derivePasswordKek(password, material);
    wipe(
      unwrapAccountKey(
        passwordKek,
        material.encryptedAccountKey,
        material.accountKeyEncryptionNonce,
      ),
    );
    return true;
  } catch {
    return false;
  } finally {
    if (passwordKek) wipe(passwordKek);
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
 * Change the master password of an account (ADR 0001 D10, linked mode), online
 * only. Needs the unlocked vault.
 *
 * 1. A fresh OPAQUE login with the current password (the server's proof that
 *    it is still known, `freshAuthProcedure`); its session is attached with
 *    `attach`, once it is known to be `account.userId`'s.
 * 2. A new OPAQUE registration for the new password and the account key
 *    rewrapped under it (recovery wrap and vault keys stay).
 * 3. The server swaps both and revokes every session, this one included: the
 *    caller logs in again with the new password.
 *
 * Throws `WrongPasswordError`, `LoginThrottledError`,
 * `PasswordChangeFailedError` (nothing changed on the server) or
 * `PasswordChangeUnconfirmedError` (the last request got no answer: the server
 * may have taken it).
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
): Promise<AccountKeyMaterial> {
  const email = normalizeEmail(account.email);

  let session: Parameters<LoginSessionFn> | undefined;
  try {
    const info = await loginUser(
      trpc,
      async (...params) => {
        session = params;
      },
      email,
      currentPassword,
    );
    // The email now belongs to another account: never touch it.
    if (info.userId !== account.userId || !session) throw new PasswordChangeFailedError();
  } catch (e) {
    if (e instanceof OpaqueLoginFailedError) throw new WrongPasswordError();
    if (e instanceof LoginThrottledError || e instanceof PasswordChangeFailedError) throw e;
    throw new PasswordChangeFailedError();
  }
  await attach(...session);

  const client: RegistrationClient = new OpaqueClient(config, opaqueKsf);
  const req = await client.registerInit(newPassword);
  if (req instanceof Error) throw new PasswordChangeFailedError();

  const { attemptId, registrationResponse } = await callServer(() =>
    trpc.user.startPasswordChange.mutate({
      email,
      registrationRequest: bytesToB64(req.serialize()),
    }),
  );

  let resp: RegistrationResponse;
  try {
    resp = RegistrationResponse.deserialize(config, b64ToBytes(registrationResponse));
  } catch {
    throw new PasswordChangeFailedError();
  }
  // Same identities as at registration and login (they bind the envelope MAC).
  const finished = await client.registerFinish(resp, SERVER_IDENTITY, email);
  if (finished instanceof Error) throw new PasswordChangeFailedError();

  const passwordKeys = await wrapAccountKeyForPassword(newPassword);
  const changed = { ...passwordKeys, userKeyPair: material.userKeyPair };
  try {
    await trpc.user.finishPasswordChange.mutate({
      attemptId,
      registrationRecord: bytesToB64(finished.record.serialize()),
      passwordKeys,
    });
  } catch (e) {
    if (isThrottled(e)) throw new LoginThrottledError();
    if (!isServerAnswer(e)) throw new PasswordChangeUnconfirmedError(changed);
    throw new PasswordChangeFailedError();
  }

  return changed;
}

async function callServer<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (isThrottled(e)) throw new LoginThrottledError();
    throw new PasswordChangeFailedError();
  }
}
