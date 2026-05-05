import * as opaque from "@serenity-kit/opaque";
import { useTRPCClient } from "../util/trpc";
import { useContext, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { genSalt, toBase64 } from "@repo/crypto";
import type { PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";

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
    const { clientLoginState, startLoginRequest } = opaque.client.startLogin({
      password,
    });

    let loginResponse: string;

    try {
      ({ loginResponse } = await trpc.login.startLogin.mutate({
        email,
        startLoginRequest,
      }));
    } catch {
      setLoginError(true);
      return;
    }

    const loginResult = opaque.client.finishLogin({
      clientLoginState,
      loginResponse,
      password,
    });

    if (!loginResult) {
      setLoginError(true);
      return;
    }

    const { finishLoginRequest, sessionKey } = loginResult;
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
      setLoginError(true);
      return;
    }

    await loginSession(sessionId, sessionKey, authSalt);

    return { email, password, userPasswordKeys };
  }

  function offlineLogin() {
    offlineLoginSession();
  }

  return { loginUser, offlineLogin, loginError };
}
