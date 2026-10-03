import type { MemberVault, UserKeyPair } from "@repo/schema";
import { type LoginBundle, secretsStore } from "@repo/store";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

export const SessionContext = createContext<{
  sessionId?: string;

  vaultUnlocked: boolean;
  loggedIn: boolean;
  isOffline: boolean;

  loginSession: (newSessionId: string, sessionKey: string, salt: Uint8Array) => Promise<void>;
  restoreLogin: (
    bundle: Omit<LoginBundle, "email">,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
  ) => void;
  offlineLoginSession: () => void;
  unlockVault: (
    passwordKek: Uint8Array,
    encryptedAccountKeyB64: string,
    accountKeyEncryptionNonceB64: string,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
  ) => void;
  unlockWithAccountKey: (
    accountKey: Uint8Array,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
    offline?: boolean,
  ) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
  endSession: () => void;
}>({
  loggedIn: false,
  vaultUnlocked: false,
  isOffline: false,
  async loginSession() {},
  restoreLogin() {},
  offlineLoginSession() {},
  unlockVault() {},
  unlockWithAccountKey() {},
  async signRequest() {
    return new Uint8Array(32);
  },
  endSession() {},
});

/**
 * Load the vault keys and the keypair (checked against its public key); on
 * failure wipe the account key again before rethrowing.
 */
function loadKeyringOrLock(vaultKeys: readonly MemberVault[], userKeyPair: UserKeyPair) {
  try {
    const skipped = secretsStore.loadVaultKeys(vaultKeys);
    if (skipped.length > 0)
      console.error(`Vault keys that don't open were skipped: ${skipped.join(", ")}`);
    secretsStore.loadUserKeyPair(userKeyPair);
  } catch (e) {
    secretsStore.lockVault();
    throw e;
  }
}

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string>();
  const [loggedIn, setLoggedIn] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  // TODO: offline state should come from network?
  // Seeded from `navigator.onLine`: a page loaded while already offline (served by
  // the service worker) never sees an `offline` event and would try the server.
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;

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

  /**
   * Restore a persisted session on app reopen (mobile). Re-establishes both the
   * server session and the unlocked vault directly from secure-storage key
   * material plus the locally cached vault keys and keypair — no OPAQUE
   * handshake, no Argon2. Throws when the vault keys or the keypair don't open.
   */
  const restoreLogin = useCallback(
    (
      bundle: Omit<LoginBundle, "email">,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
    ) => {
      secretsStore.restoreSession(bundle);
      loadKeyringOrLock(vaultKeys, userKeyPair);
      setSessionId(bundle.sessionId);
      setLoggedIn(true);
      setVaultUnlocked(true);
    },
    [],
  );

  const offlineLoginSession = useCallback(() => {
    setSessionId("offline");
    setLoggedIn(true);
  }, []);

  /**
   * Throws (on a wrong password, or a vault key or keypair that doesn't open)
   * with nothing left in memory.
   */
  const unlockVault = useCallback(
    (
      passwordKek: Uint8Array,
      encryptedAccountKeyB64: string,
      accountKeyEncryptionNonceB64: string,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
    ) => {
      secretsStore.unlockAccount(passwordKek, encryptedAccountKeyB64, accountKeyEncryptionNonceB64);
      loadKeyringOrLock(vaultKeys, userKeyPair);
      setVaultUnlocked(true);
    },
    [],
  );

  /**
   * Unlock vault with a pre-decrypted account key (e.g. from biometric).
   * When offline, also sets sessionId to "offline".
   */
  const unlockWithAccountKey = useCallback(
    (
      accountKey: Uint8Array,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
      offline = false,
    ) => {
      secretsStore.unlockWithAccountKey(accountKey);
      loadKeyringOrLock(vaultKeys, userKeyPair);
      if (offline) setSessionId("offline");
      setVaultUnlocked(true);
    },
    [],
  );

  const signRequest = useCallback(async (message: string) => secretsStore.signRequest(message), []);

  /** Reset all session state. Does NOT wipe keys/storage — see useLogout(). */
  const endSession = useCallback(() => {
    setSessionId(undefined);
    setLoggedIn(false);
    setVaultUnlocked(false);
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      loggedIn,
      vaultUnlocked,
      isOffline,
      loginSession,
      restoreLogin,
      offlineLoginSession,
      unlockVault,
      unlockWithAccountKey,
      signRequest,
      endSession,
    }),
    [
      sessionId,
      loggedIn,
      vaultUnlocked,
      isOffline,
      loginSession,
      restoreLogin,
      offlineLoginSession,
      unlockVault,
      unlockWithAccountKey,
      signRequest,
      endSession,
    ],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
