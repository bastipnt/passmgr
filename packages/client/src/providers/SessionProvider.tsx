import { createContext, useEffect, useState, type ReactNode } from "react";
import { secretsStore } from "../secrets-store";

const sessionStates = {
  loggedOut: "logged-out", // no session
  loggedIn: "logged-in", // authenticated, unlocked vault
  authenticated: "authenticated", // only authenticated, locked vault
  unlocked: "unlocked", // not authenticated, unlocked vault
  biometricEnrollPending: "biometric-enroll-pending", // unlocked vault -> user can enroll in biometric unlocking (auth state is unimportant here)
  biometricUnlockPending: "biometric-unlock-pending", // locked vault, TODO: unauthenticated -> needs to be able to authenticate
} as const;

type SessionState = (typeof sessionStates)[keyof typeof sessionStates];

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<{
  sessionId?: string;

  sessionState: SessionState;
  vaultReady: boolean;
  isOffline: boolean;

  loginSession: (newSessionId: string, sessionKey: string, salt: Uint8Array) => Promise<void>;
  offlineLoginSession: () => void;
  unlockVault: (
    passwordKek: Uint8Array,
    encryptedVaultKeyB64: string,
    vaultKeyEncryptionNonceB64: string,
  ) => void;
  offlineUnlockWithVaultKey: (vaultKey: Uint8Array) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
}>({
  sessionState: sessionStates.loggedOut,
  vaultReady: false,
  isOffline: false,
  async loginSession() {},
  offlineLoginSession() {},
  unlockVault() {},
  // offlineUnlock() {},
  offlineUnlockWithVaultKey() {},
  async signRequest() {
    return new Uint8Array(32);
  },
});

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string>();
  const [sessionState, setSessionState] = useState<SessionState>(sessionStates.loggedOut);
  const [vaultReady, setVaultReady] = useState(false);
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
  async function loginSession(
    newSessionId: string,
    sessionKey: string,
    salt: Uint8Array,
    // userPasswordKeys: PasswordKeySchema,
  ) {
    await secretsStore.unlockSession(newSessionId, sessionKey, salt);
    // in here we can not be offline, so we set isOffline -> false
    // setIsOffline(false);
    setSessionId(newSessionId);
    setSessionState(sessionStates.loggedIn);
  }

  function offlineLoginSession() {
    setSessionId("offline");
    setSessionState(sessionStates.loggedIn);
  }

  // TODO: why difference between unlock and offlineUnlock
  function unlockVault(
    passwordKek: Uint8Array,
    encryptedVaultKeyB64: string,
    vaultKeyEncryptionNonceB64: string,
  ) {
    secretsStore.unlockVault(passwordKek, encryptedVaultKeyB64, vaultKeyEncryptionNonceB64);
    setVaultReady(true);
  }

  // TODO: needs to work online as well
  function offlineUnlockWithVaultKey(vaultKey: Uint8Array) {
    secretsStore.unlockWithVaultKey(vaultKey);
    // setIsOffline(true);
    setSessionId("offline");
    setVaultReady(true);
  }

  async function signRequest(message: string) {
    return await secretsStore.signRequest(message);
  }

  return (
    <SessionContext
      value={{
        sessionId,
        sessionState,
        vaultReady,
        isOffline,
        loginSession,
        offlineLoginSession,
        unlockVault,
        // offlineUnlock,
        offlineUnlockWithVaultKey,
        signRequest,
      }}
    >
      {children}
    </SessionContext>
  );
}
