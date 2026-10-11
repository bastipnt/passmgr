import type { VaultUnlockInfo } from "@repo/schema";
import { useCallback, useContext, useState } from "react";
import {
  LoginFinishFailedError,
  LoginStartFailedError,
  LoginThrottledError,
  loginUser as loginUserCore,
  OpaqueLoginFailedError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useTRPCClient } from "../util/trpc";

export function useLogin() {
  const trpc = useTRPCClient();
  const { attachServer } = useContext(SessionContext);
  const [loginError, setLoginError] = useState(false);
  const [loginThrottled, setLoginThrottled] = useState(false);
  // The two-factor step ran out (too slow, or too many wrong codes).
  const [secondFactorExpired, setSecondFactorExpired] = useState(false);
  const contextPrompt = useSecondFactorPrompt();

  /**
   * Performs the OPAQUE login and establishes the session (fast).
   * Returns the info needed to derive the vault key (slow Argon2id step)
   * so the caller can run it off the main thread. With two-factor on, the code
   * is asked with `onSecondFactor` (default: the app's `SecondFactorPromptProvider`).
   * Resolves undefined when it failed (see the error flags) or the user
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
      if (err instanceof LoginThrottledError) {
        setLoginThrottled(true);
        return;
      }
      if (err instanceof SecondFactorCancelledError) return;
      if (err instanceof SecondFactorExpiredError) {
        setSecondFactorExpired(true);
        return;
      }
      if (
        err instanceof LoginStartFailedError ||
        err instanceof LoginFinishFailedError ||
        err instanceof OpaqueLoginFailedError
      ) {
        setLoginError(true);
        return;
      }
      throw err;
    }
  }

  /** Hide a previous attempt's error, e.g. once the user edits the credentials. */
  const clearLoginError = useCallback(() => {
    setLoginError(false);
    setSecondFactorExpired(false);
  }, []);

  /**
   * Also hides the throttle warning — only when it no longer applies (a new
   * attempt, another account). An edit alone doesn't lift the server's lock.
   */
  const clearLoginErrors = useCallback(() => {
    setLoginError(false);
    setLoginThrottled(false);
    setSecondFactorExpired(false);
  }, []);

  return {
    loginUser,
    clearLoginError,
    clearLoginErrors,
    loginError,
    loginThrottled,
    secondFactorExpired,
  };
}
