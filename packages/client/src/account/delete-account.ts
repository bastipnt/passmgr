import type { AppRouter } from "@repo/types";
import type { TRPCClient, TRPCClientError } from "@trpc/client";
import { type LoginSessionFn, LoginThrottledError, type SecondFactorPrompt } from "../login";
import { isPreconditionFailed, isServerAnswer, isThrottled } from "../util/trpc-errors";
import { freshLogin } from "./change-password";

export type DeleteAccountTRPCClient = Pick<TRPCClient<AppRouter>, "login" | "user">;

/** The server couldn't be reached or refused; the account is unchanged. */
export class AccountDeletionFailedError extends Error {
  override message = "AccountDeletionFailedError";
}

/** The account alone owns shared vaults other members are in: hand them over or delete them first. */
export class SoleVaultOwnerError extends Error {
  override message = "SoleVaultOwnerError";
  readonly vaultIds: string[];

  constructor(vaultIds: string[]) {
    super();
    this.vaultIds = vaultIds;
  }
}

/** The deletion was sent but got no answer (network): the server may have taken it. */
export class AccountDeletionUnconfirmedError extends Error {
  override message = "AccountDeletionUnconfirmedError";
}

/**
 * Delete the account on the server for good (linked mode, online only): a
 * fresh OPAQUE login with the password (`freshAuthProcedure`), attached with
 * `attach`, then `user.deleteAccount`. Every session ends, this one included.
 * The local copy is the caller's to remove.
 *
 * Throws `WrongPasswordError`, `LoginThrottledError`, a second-factor error
 * (see `freshLogin`), `SoleVaultOwnerError`,
 * `AccountDeletionFailedError` (nothing changed on the server) or
 * `AccountDeletionUnconfirmedError`.
 */
export async function deleteAccount(
  trpc: DeleteAccountTRPCClient,
  attach: LoginSessionFn,
  account: { email: string; userId: string },
  password: string,
  onSecondFactor?: SecondFactorPrompt,
): Promise<void> {
  await freshLogin(trpc, attach, account, password, AccountDeletionFailedError, onSecondFactor);
  try {
    await trpc.user.deleteAccount.mutate();
  } catch (e) {
    if (isThrottled(e)) throw new LoginThrottledError();
    if (isPreconditionFailed(e)) {
      const data = (e as TRPCClientError<AppRouter>).data;
      throw new SoleVaultOwnerError(data && "vaultIds" in data ? data.vaultIds : []);
    }
    if (!isServerAnswer(e)) throw new AccountDeletionUnconfirmedError();
    throw new AccountDeletionFailedError();
  }
}
