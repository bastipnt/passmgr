import { useContext, useState } from "react";
import { useTRPCClient } from "../util/trpc";
import { SessionContext } from "../providers/SessionProvider";
import {
  LoginFinishFailedError,
  LoginStartFailedError,
  OpaqueLoginFailedError,
  loginUser as loginUserCore,
} from "../login";
import type { VaultUnlockInfo } from "@repo/schema";

export function useLogin() {
  const trpc = useTRPCClient();
  const { loginSession, offlineLoginSession } = useContext(SessionContext);
  const [loginError, setLoginError] = useState(false);

  /**
   * Performs the OPAQUE login and establishes the session (fast).
   * Returns the info needed to derive the vault key (slow Argon2id step)
   * so the caller can run it off the main thread.
   */
  async function loginUser(email: string, password: string): Promise<VaultUnlockInfo | undefined> {
    try {
      return await loginUserCore(trpc, loginSession, email, password);
    } catch (err) {
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

  function offlineLogin() {
    offlineLoginSession();
  }

  return { loginUser, offlineLogin, loginError };
}
