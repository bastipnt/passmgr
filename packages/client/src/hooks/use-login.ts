import type { VaultUnlockInfo } from "@repo/schema";
import { useCallback, useContext, useState } from "react";
import {
  LoginFinishFailedError,
  LoginStartFailedError,
  LoginThrottledError,
  LoginUnreachableError,
  loginUser as loginUserCore,
  OpaqueLoginFailedError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useTRPCClient } from "../util/trpc";
import type { UnlockError } from "./use-unlock";

/**
 * - `credentials`: wrong password or unknown email (the server can't tell them apart)
 * - `unreachable`: no connection to the server, or it failed on its side
 * - `throttled`: too many login attempts, retry later
 * - `second_factor_expired`: the two-factor step ran out (too slow, or too many wrong codes)
 */
export type LoginError = "credentials" | "unreachable" | "throttled" | "second_factor_expired";

export type SignInErrorMessage = { title: string; detail: string; warning?: boolean };

/** User-facing text for a failed sign-in or unlock (web + mobile). */
export function signInErrorMessage(
  loginError: LoginError | undefined,
  unlockError: UnlockError | undefined,
  localVault: boolean,
): SignInErrorMessage | undefined {
  if (loginError === "throttled")
    return {
      title: "Too many login attempts.",
      detail: "Please wait and try again.",
      warning: true,
    };
  if (loginError === "second_factor_expired")
    return {
      title: "Two-factor sign-in timed out.",
      detail: "It took too long or had too many wrong codes. Sign in again.",
    };
  if (loginError === "unreachable")
    return {
      title: "Can't reach the server.",
      detail: "Check your connection, or try again in a moment.",
    };
  if (unlockError === "wrong_account")
    return {
      title: "Can't add an account offline.",
      detail: "Only the vaults on this device can be unlocked without a connection.",
    };
  if (loginError || unlockError)
    return {
      title: "That didn't work.",
      detail: `Check your ${localVault ? "password" : "email and password"} and try again.`,
    };
  return undefined;
}

export function useLogin() {
  const trpc = useTRPCClient();
  const { attachServer } = useContext(SessionContext);
  const [loginError, setLoginError] = useState<LoginError>();
  const contextPrompt = useSecondFactorPrompt();

  /**
   * Performs the OPAQUE login and establishes the session (fast).
   * Returns the info needed to derive the vault key (slow Argon2id step)
   * so the caller can run it off the main thread. With two-factor on, the code
   * is asked with `onSecondFactor` (default: the app's `SecondFactorPromptProvider`).
   * Resolves undefined when it failed (see `loginError`) or the user
   * closed the code prompt.
   */
  async function loginUser(
    email: string,
    password: string,
    onSecondFactor?: SecondFactorPrompt,
  ): Promise<VaultUnlockInfo | undefined> {
    clearLoginErrors();
    try {
      return await loginUserCore(
        trpc,
        attachServer,
        email,
        password,
        onSecondFactor ?? contextPrompt,
      );
    } catch (err) {
      if (err instanceof SecondFactorCancelledError) return;
      const error = loginFailure(err);
      if (!error) throw err;
      setLoginError(error);
      return;
    }
  }

  /**
   * Hide a previous attempt's error, e.g. once the user edits the credentials.
   * The throttle warning stays: an edit alone doesn't lift the server's lock.
   */
  const clearLoginError = useCallback(() => {
    setLoginError((error) => (error === "throttled" ? error : undefined));
  }, []);

  /** Also hides the throttle warning: a new attempt, another account. */
  const clearLoginErrors = useCallback(() => setLoginError(undefined), []);

  return { loginUser, clearLoginError, clearLoginErrors, loginError };
}

function loginFailure(err: unknown): LoginError | undefined {
  if (err instanceof LoginThrottledError) return "throttled";
  if (err instanceof SecondFactorExpiredError) return "second_factor_expired";
  if (err instanceof LoginUnreachableError) return "unreachable";
  if (
    err instanceof LoginStartFailedError ||
    err instanceof LoginFinishFailedError ||
    err instanceof OpaqueLoginFailedError
  )
    return "credentials";
  return undefined;
}
