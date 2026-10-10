import {
  type AccountKeyMaterial,
  isCompleteKeyChain,
  type MemberVault,
  type RecoveryKeySchema,
  type VaultUnlockInfo,
} from "@repo/schema";
import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";
import {
  type LoginSessionFn,
  LoginThrottledError,
  loginUser,
  OpaqueLoginFailedError,
} from "../login";
import {
  RegistrationFinishFailedError,
  type RegistrationKeyring,
  RegistrationStartFailedError,
  registerAccount,
} from "../register";

export type LinkTRPCClient = Pick<TRPCClient<AppRouter>, "register" | "login">;

/**
 * The local vault can't be uploaded as it is: no personal vault, a keypair
 * that isn't in its first version, or a rotated vault missing earlier keys.
 */
export class LinkUnavailableError extends Error {
  override message = "LinkUnavailableError";
}

/** The login refused the password: the email belongs to another account. */
export class LinkRejectedError extends Error {
  override message = "LinkRejectedError";
}

/**
 * The login worked, but the account behind the email holds other keys than
 * this vault. `session` is that account's: end it, never attach it.
 */
export class LinkAccountMismatchError extends Error {
  override message = "LinkAccountMismatchError";
  readonly session: Parameters<LoginSessionFn>;

  constructor(session: Parameters<LoginSessionFn>) {
    super();
    this.session = session;
  }
}

/** A linked account's first login: what it returned, and the session to attach once checked. */
export type LinkedAccount = {
  info: VaultUnlockInfo;
  session: Parameters<LoginSessionFn>;
};

/**
 * A local vault's keyring as `finishRegistration` takes it (ADR 0001 D9): the
 * stored password wrap, the recovery wrap + verifier made at creation (so the
 * user's recovery key stays valid), the keypair and every vault with its
 * wrapped key. Nothing is generated or re-encrypted.
 */
export function localVaultKeyring(
  material: AccountKeyMaterial,
  recovery: RecoveryKeySchema,
  vaults: readonly MemberVault[],
): RegistrationKeyring {
  const { userKeyPair, ...passwordWrap } = material;
  // A rotated vault goes up as it is: its records' key versions need every earlier key.
  const toInput = ({ kind: _kind, role: _role, ...vault }: MemberVault) => {
    if (!isCompleteKeyChain(vault.keyVersion, vault.previousKeys)) throw new LinkUnavailableError();
    return vault;
  };

  const personal = vaults.find((v) => v.kind === "personal");
  if (!personal || userKeyPair.keyVersion !== 1) throw new LinkUnavailableError();
  const others = vaults.filter((v) => v !== personal);
  return {
    userKeys: { ...passwordWrap, ...recovery },
    personalVault: toInput(personal),
    userKeyPair: { ...userKeyPair, keyVersion: 1 },
    vaults: others.length > 0 ? others.map(toInput) : undefined,
  };
}

/**
 * Create the server account for a local vault (ADR 0001 D9): register
 * `email` with the vault's own keyring, then log in to it. Resolves the login
 * with its session held back, for the caller to attach once the profile is
 * linked.
 *
 * Safe to repeat after an interruption: the server keeps an account that
 * exists already (registering again changes nothing, and an invite is spent
 * by then), so the login decides. It must open an account holding this
 * vault's keypair; anything else is another account's.
 *
 * Throws `RegistrationStartFailedError` / `RegistrationFinishFailedError`
 * (registration failed and there is no account to log in to),
 * `LinkRejectedError`, `LinkAccountMismatchError`, `LoginThrottledError` or a
 * login error.
 */
export async function registerLocalVault(
  trpc: LinkTRPCClient,
  email: string,
  password: string,
  keyring: RegistrationKeyring,
  invite?: string,
): Promise<LinkedAccount> {
  let registerFailed: Error | undefined;
  try {
    await registerAccount(trpc, email, password, () => keyring, invite);
  } catch (e) {
    if (!(e instanceof RegistrationStartFailedError || e instanceof RegistrationFinishFailedError))
      throw e;
    registerFailed = e;
  }

  let session: LinkedAccount["session"] | undefined;
  let info: VaultUnlockInfo;
  try {
    info = await loginUser(
      trpc,
      async (...params) => {
        session = params;
      },
      email,
      password,
    );
  } catch (e) {
    if (e instanceof LoginThrottledError) throw e;
    // No account to log in to: the registration's failure is the one to report.
    if (registerFailed) throw registerFailed;
    if (e instanceof OpaqueLoginFailedError) throw new LinkRejectedError();
    throw e;
  }
  if (!session) throw new LinkRejectedError();

  // The email was taken by an account with the same password: never this vault's.
  if (info.userKeyPair.publicKey !== keyring.userKeyPair.publicKey)
    throw new LinkAccountMismatchError(session);

  return { info, session };
}
