import * as opaque from "@serenity-kit/opaque";
import { useTRPCClient } from "./util/trpc";
import { useContext, useState } from "react";
import { SessionContext } from "./providers/SessionProvider";
import { genSalt, toBase64 } from "@repo/crypto";
import type { PasswordKeySchema } from "@repo/schema";

export function useLogin() {
  const trpc = useTRPCClient();
  const { login } = useContext(SessionContext);
  const [loginError, setLoginError] = useState(false);

  async function loginUser(email: string, password: string) {
    const { clientLoginState, startLoginRequest } = opaque.client.startLogin({
      password,
    });

    let loginResponse: string;

    try {
      ({ loginResponse } = await trpc.login.startLogin.mutate({
        email,
        startLoginRequest,
      }));
    } catch (error) {
      console.log(error);
      setLoginError(true);
      return;
    }

    const loginResult = opaque.client.finishLogin({
      clientLoginState,
      loginResponse,
      password,
    });

    if (!loginResult) {
      console.log("Login failed");
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
    } catch (error) {
      console.log(error);
      setLoginError(true);
      return;
    }

    await login(sessionId, sessionKey, authSalt, userPasswordKeys, password);
  }

  return { loginUser, loginError };
}
