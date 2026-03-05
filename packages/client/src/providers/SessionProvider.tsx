import { createContext, useState, type ReactNode } from "react";
import { secretsStore } from "../secrets-store";
import type { PasswordKeySchema } from "@repo/schema";

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<{
  sessionId?: string;
  vaultReady: boolean;
  loginSession: (
    newSessionId: string,
    sessionKey: string,
    salt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
  ) => Promise<void>;
  unlockVault: (passwordKek: Uint8Array) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
}>({
  vaultReady: false,
  async loginSession() {},
  unlockVault() {},
  async signRequest() {
    return new Uint8Array(32);
  },
});

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string>();
  const [vaultReady, setVaultReady] = useState(false);

  async function loginSession(
    newSessionId: string,
    sessionKey: string,
    salt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
  ) {
    await secretsStore.unlockSession(newSessionId, sessionKey, salt, userPasswordKeys);
    setSessionId(newSessionId);
  }

  function unlockVault(passwordKek: Uint8Array) {
    secretsStore.unlockVaultWithKek(passwordKek);
    setVaultReady(true);
  }

  async function signRequest(message: string) {
    return await secretsStore.signRequest(message);
  }

  return (
    <SessionContext value={{ sessionId, vaultReady, loginSession, unlockVault, signRequest }}>
      {children}
    </SessionContext>
  );
}
