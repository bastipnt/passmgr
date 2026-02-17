import { secretsStore } from "@repo/client";
import { createContext, useState, type ReactNode } from "react";

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<{
  sessionId?: string;
  login: (newSessionId: string, sessionKey: string, salt: Uint8Array) => void;
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

  async function login(newSessionId: string, sessionKey: string, salt: Uint8Array) {
    setSessionId(newSessionId);
    await secretsStore.unlock(newSessionId, sessionKey, salt);
  }

  async function signRequest(message: string) {
    return await secretsStore.signRequest(message);
  }

  return <SessionContext value={{ sessionId, login, signRequest }}>{children}</SessionContext>;
}
