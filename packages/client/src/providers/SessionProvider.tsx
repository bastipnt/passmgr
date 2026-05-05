import { secretsStore } from "@repo/store";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export const SessionContext = createContext<{
  sessionId?: string;

  vaultUnlocked: boolean;
  loggedIn: boolean;
  isOffline: boolean;

  loginSession: (newSessionId: string, sessionKey: string, salt: Uint8Array) => Promise<void>;
  offlineLoginSession: () => void;
  unlockVault: (
    passwordKek: Uint8Array,
    encryptedVaultKeyB64: string,
    vaultKeyEncryptionNonceB64: string,
  ) => void;
  unlockWithVaultKey: (vaultKey: Uint8Array, offline?: boolean) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
}>({
  loggedIn: false,
  vaultUnlocked: false,
  isOffline: false,
  async loginSession() {},
  offlineLoginSession() {},
  unlockVault() {},
  unlockWithVaultKey() {},
  async signRequest() {
    return new Uint8Array(32);
  },
});

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string>();
  const [loggedIn, setLoggedIn] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  // TODO: offline state should come from network?
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /**
   * Called after a successful login
   * ⚠️ online only ⚠️
   */
  const loginSession = useCallback(
    async (newSessionId: string, sessionKey: string, salt: Uint8Array) => {
      await secretsStore.unlockSession(newSessionId, sessionKey, salt);
      setSessionId(newSessionId);
      setLoggedIn(true);
    },
    [],
  );

  const offlineLoginSession = useCallback(() => {
    setSessionId("offline");
    setLoggedIn(true);
  }, []);

  const unlockVault = useCallback(
    (passwordKek: Uint8Array, encryptedVaultKeyB64: string, vaultKeyEncryptionNonceB64: string) => {
      secretsStore.unlockVault(passwordKek, encryptedVaultKeyB64, vaultKeyEncryptionNonceB64);
      setVaultUnlocked(true);
    },
    [],
  );

  /**
   * Unlock vault with a pre-decrypted key (e.g. from biometric).
   * When offline, also sets sessionId to "offline".
   */
  const unlockWithVaultKey = useCallback((vaultKey: Uint8Array, offline = false) => {
    if (offline) setSessionId("offline");
    secretsStore.unlockWithVaultKey(vaultKey);
    setVaultUnlocked(true);
  }, []);

  const signRequest = useCallback(async (message: string) => secretsStore.signRequest(message), []);

  const value = useMemo(
    () => ({
      sessionId,
      loggedIn,
      vaultUnlocked,
      isOffline,
      loginSession,
      offlineLoginSession,
      unlockVault,
      unlockWithVaultKey,
      signRequest,
    }),
    [
      sessionId,
      loggedIn,
      vaultUnlocked,
      isOffline,
      loginSession,
      offlineLoginSession,
      unlockVault,
      unlockWithVaultKey,
      signRequest,
    ],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
