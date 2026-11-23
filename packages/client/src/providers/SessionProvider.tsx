import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { MemberVault, UserKeyPair } from "@repo/schema";
import { type LoginBundle, type ProfileMode, secretsStore } from "@repo/store";
import { logError } from "@repo/util";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { initDecryptWorker } from "../util/decrypt-record";

/**
 * The state of an unlocked session (ADR 0001 D2):
 * - `local`: no account exists, the vault lives on this device only
 * - `online`: the profile is linked and a server session is attached
 * - `offline`: the profile is linked, but no server session (no connection,
 *   or it expired). Reading works, the server waits for a reconnect.
 */
export type SessionMode = "local" | "online" | "offline";

type SessionContextValue = {
  vaultUnlocked: boolean;
  /** Undefined while the vault is locked. */
  mode?: SessionMode;
  /** The device has no network (browser `offline` event). Says nothing about the server session. */
  networkOffline: boolean;

  /**
   * Attach server auth from a fresh OPAQUE session. Can come before the vault
   * is unlocked (login) or after it (reconnect).
   */
  attachServer: (sessionId: string, sessionKey: Uint8Array, salt: Uint8Array) => Promise<void>;
  /** Drop the server session keys (ended or expired): `online` → `offline`. */
  detachServer: () => void;
  /**
   * The unlocked `local` profile was just linked to an account (ADR 0001 D9):
   * attach its first server session, `local` → `online` (`offline` when
   * attaching throws). The profile row must say `linked` already: being online
   * starts the sync, which uploads it.
   */
  linkServer: (sessionId: string, sessionKey: Uint8Array, salt: Uint8Array) => Promise<void>;

  /**
   * Restore a persisted bundle on app reopen (mobile): the vault from the
   * bundle's account key plus the locally cached vault keys and keypair, and
   * the server session when the bundle has one. No OPAQUE handshake, no
   * Argon2. Throws when the vault keys or the keypair don't open.
   */
  restoreLogin: (
    profileMode: ProfileMode,
    bundle: LoginBundle,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
  ) => void;
  /**
   * Unwrap the account key with the password KEK. Throws (on a wrong password,
   * or a vault key or keypair that doesn't open) with nothing left in memory.
   */
  unlockVault: (
    profileMode: ProfileMode,
    passwordKek: Uint8Array,
    encryptedAccountKeyB64: string,
    accountKeyEncryptionNonceB64: string,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
  ) => void;
  /** Unlock with an already decrypted account key (e.g. from biometrics). */
  unlockWithAccountKey: (
    profileMode: ProfileMode,
    accountKey: Uint8Array,
    vaultKeys: readonly MemberVault[],
    userKeyPair: UserKeyPair,
  ) => void;
  signRequest: (message: string) => Promise<Uint8Array>;
  /**
   * Wipe every key from memory (the secrets store and the decrypt worker) and
   * reset the session state. The local data stays; see `useLock()` for the query cache.
   */
  lock: () => void;
};

export const SessionContext = createContext<SessionContextValue>({
  vaultUnlocked: false,
  networkOffline: false,
  async attachServer() {},
  detachServer() {},
  async linkServer() {},
  restoreLogin() {},
  unlockVault() {},
  unlockWithAccountKey() {},
  async signRequest() {
    return new Uint8Array(32);
  },
  lock() {},
});

/**
 * Open the vault behind an unwrapped account key: load the vault keys and the keypair (checked
 * against its public key), then seed the decrypt worker. On failure wipe the account key again.
 */
export function openVault(vaultKeys: readonly MemberVault[], userKeyPair: UserKeyPair) {
  try {
    const skipped = secretsStore.loadVaultKeys(vaultKeys);
    if (skipped.length > 0)
      logError(`Vault keys that don't open were skipped: ${skipped.join(", ")}`);
    secretsStore.loadUserKeyPair(userKeyPair);
  } catch (e) {
    secretsStore.lockVault();
    throw e;
  }
  initDecryptWorker();
}

export function sessionMode(
  profileMode: ProfileMode | undefined,
  serverAttached: boolean,
): SessionMode | undefined {
  if (!profileMode) return undefined;
  if (profileMode === "local") return "local";
  return serverAttached ? "online" : "offline";
}

type SessionProviderProps = {
  children: ReactNode;
};

export default function SessionProvider({ children }: SessionProviderProps) {
  // Set once the vault is unlocked: whose vault it is decides the mode.
  const [profileMode, setProfileMode] = useState<ProfileMode>();
  const [serverAttached, setServerAttached] = useState(false);
  // Seeded from `navigator.onLine`: a page loaded while already offline (served by
  // the service worker) never sees an `offline` event and would try the server.
  const [networkOffline, setNetworkOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;

    const handleOnline = () => setNetworkOffline(false);
    const handleOffline = () => setNetworkOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const attachServer = useCallback(
    async (sessionId: string, sessionKey: Uint8Array, salt: Uint8Array) => {
      await secretsStore.unlockSession(sessionId, sessionKey, salt);
      setServerAttached(true);
    },
    [],
  );

  const detachServer = useCallback(() => {
    secretsStore.detachServer();
    setServerAttached(false);
  }, []);

  const linkServer = useCallback(
    async (sessionId: string, sessionKey: Uint8Array, salt: Uint8Array) => {
      if (!secretsStore.isVaultUnlocked) throw new Error("Unlock the vault before linking it");
      // Linked first: should attaching fail, the session is `offline`, like any linked one.
      setProfileMode("linked");
      await secretsStore.unlockSession(sessionId, sessionKey, salt);
      setServerAttached(true);
    },
    [],
  );

  const restoreLogin = useCallback(
    (
      mode: ProfileMode,
      bundle: LoginBundle,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
    ) => {
      // A local profile never talks to the server, whatever the bundle holds.
      secretsStore.restoreSession(mode === "linked" ? bundle : { ...bundle, server: undefined });
      openVault(vaultKeys, userKeyPair);
      setServerAttached(secretsStore.hasServerSession);
      setProfileMode(mode);
    },
    [],
  );

  const unlockVault = useCallback(
    (
      mode: ProfileMode,
      passwordKek: Uint8Array,
      encryptedAccountKeyB64: string,
      accountKeyEncryptionNonceB64: string,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
    ) => {
      secretsStore.unlockAccount(passwordKek, encryptedAccountKeyB64, accountKeyEncryptionNonceB64);
      openVault(vaultKeys, userKeyPair);
      setProfileMode(mode);
    },
    [],
  );

  const unlockWithAccountKey = useCallback(
    (
      mode: ProfileMode,
      accountKey: Uint8Array,
      vaultKeys: readonly MemberVault[],
      userKeyPair: UserKeyPair,
    ) => {
      secretsStore.unlockWithAccountKey(accountKey);
      openVault(vaultKeys, userKeyPair);
      setProfileMode(mode);
    },
    [],
  );

  const signRequest = useCallback(async (message: string) => secretsStore.signRequest(message), []);

  const lock = useCallback(() => {
    secretsStore.lock();
    decryptWorkerService.wipe();
    setProfileMode(undefined);
    setServerAttached(false);
  }, []);

  const value = useMemo(
    () => ({
      vaultUnlocked: profileMode !== undefined,
      mode: sessionMode(profileMode, serverAttached),
      networkOffline,
      attachServer,
      detachServer,
      linkServer,
      restoreLogin,
      unlockVault,
      unlockWithAccountKey,
      signRequest,
      lock,
    }),
    [
      profileMode,
      serverAttached,
      networkOffline,
      attachServer,
      detachServer,
      linkServer,
      restoreLogin,
      unlockVault,
      unlockWithAccountKey,
      signRequest,
      lock,
    ],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
