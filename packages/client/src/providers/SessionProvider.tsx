import { createContext, useState, type ReactNode } from "react";
import { secretsStore } from "../secrets-store";
import type { PasswordKeySchema } from "@repo/schema";

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<{
  sessionId?: string;
  login: (
    newSessionId: string,
    sessionKey: string,
    salt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
  ) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
}>({
  login() {},
  async signRequest() {
    return new Uint8Array(32);
  },
});

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string>();

  async function login(
    newSessionId: string,
    sessionKey: string,
    salt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
  ) {
    setSessionId(newSessionId);
    await secretsStore.unlock(newSessionId, sessionKey, salt, userPasswordKeys);
  }

  async function signRequest(message: string) {
    return await secretsStore.signRequest(message);
  }

  return <SessionContext value={{ sessionId, login, signRequest }}>{children}</SessionContext>;
}
