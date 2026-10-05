import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, MemberVault } from "@repo/schema";
import { clearLoginBundle, type LocalProfile, secretsStore, Vault } from "@repo/store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isUnauthorized } from "../opaque";
import { PREF_KEYS } from "../preferences/preference-keys";
import { SyncManager } from "../sync-manager";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { usePreferences } from "./PreferencesProvider";
import { SessionContext } from "./SessionProvider";

type StoreContextValue = {
  vault: Vault;
  syncManager: SyncManager;

  /** Whose vault this device holds (ADR 0001 D2); null until there is one. */
  profile: LocalProfile | null;
  /** The cached account key wrap: present once this device can unlock without the server. */
  accountKeyMaterial: AccountKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  biometricDismissed: boolean;

  needsBiometricEnroll: boolean;
  setBiometricDismissed: (dismissed: boolean) => void;
  /**
   * Store the account key wrap and the vaults (and, when given, a new profile)
   * atomically, and update `profile` / `accountKeyMaterial` to match.
   */
  saveAccount: (
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    profile?: LocalProfile,
  ) => Promise<void>;
  /**
   * Delete the local vault, profile, persisted login and biometric enrollment.
   * Doesn't lock: an unlocked caller locks first (`useRemoveFromDevice`).
   */
  removeVault: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * A sync brought a changed vault list (a vault added, removed, renamed, rekeyed):
 * load its keys into memory and the decrypt worker. A vault whose wrap doesn't
 * open is skipped (its records stay hidden); a broken personal vault keeps the
 * keys loaded before.
 */
export function reloadVaultKeys(vaults: readonly MemberVault[]) {
  if (!secretsStore.isVaultUnlocked) return;
  try {
    const skipped = secretsStore.loadVaultKeys(vaults);
    if (skipped.length > 0)
      console.error(`Vault keys that don't open were skipped: ${skipped.join(", ")}`);
    initDecryptWorker();
  } catch (e) {
    console.error("Vault keys from sync could not be loaded", e);
  }
}

export function useStore(): StoreContextValue {
  const store = useContext(StoreContext);
  if (store === null) throw new Error("Store could not be loaded");

  return store;
}

type StoreProviderProps = {
  vault: Vault;
  /**
   * Gates the SSE subscription and periodic sync. Mobile passes the app's
   * foreground state — the OS suspends sockets and timers in the background, so
   * the stream has to be torn down and re-established rather than left to rot.
   */
  syncEnabled?: boolean;
  children: ReactNode;
};

export function StoreProvider({ vault, syncEnabled = true, children }: StoreProviderProps) {
  const { mode, networkOffline, detachServer } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const preferences = usePreferences();

  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [accountKeyMaterial, setAccountKeyMaterial] = useState<AccountKeyMaterial | null>(null);
  const [biometricKeyMaterial, setBiometricKeyMaterial] = useState<BiometricKeyMaterial | null>(
    null,
  );

  const [biometricDismissed, setBiometricDismissed_] = useState(
    Number(preferences.get(PREF_KEYS.biometricDismissed)) === 1,
  );

  const needsBiometricEnroll = !biometricDismissed && biometricKeyMaterial === null;

  function setBiometricDismissed(dismissed: boolean) {
    setBiometricDismissed_(dismissed);

    if (dismissed) preferences.set(PREF_KEYS.biometricDismissed, "1");
    else preferences.remove(PREF_KEYS.biometricDismissed);
  }

  // The server no longer accepts the session (expired, revoked): go offline
  // instead of locking, and stop persisting the dead session.
  const detachRef = useRef(detachServer);
  detachRef.current = detachServer;
  const onUnauthorized = useCallback(() => {
    detachRef.current();
    void persistSession();
  }, []);

  const syncManagerRef = useRef<SyncManager | null>(null);
  if (!syncManagerRef.current) {
    syncManagerRef.current = new SyncManager(
      vault,
      async (cursors) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false)
          throw new Error("offline");
        try {
          return await trpc.record.sync.query({ cursors });
        } catch (e) {
          if (isUnauthorized(e)) onUnauthorized();
          throw e;
        }
      },
      reloadVaultKeys,
    );
  }
  const syncManager = syncManagerRef.current;

  // Load the profile and key material on mount: they decide whether this device
  // can unlock without the server.
  useEffect(() => {
    void vault.getProfile().then(setProfile);
    void vault.getAccountKeyMaterial().then(setAccountKeyMaterial);
    void vault.getBiometricKeyMaterial().then(setBiometricKeyMaterial);
  }, [vault]);

  // Sync once the vault is unlocked with a server session (`online`) + start
  // periodic sync + SSE subscription + resync when back online. Not right after
  // the OPAQUE login: the unlock still has to decide whose data the local DB
  // holds (and may clear it), and a sync that lands before that would be wiped
  // with it. `local` and `offline` never reach the server.
  const online = mode === "online";
  useEffect(() => {
    if (!online || networkOffline || !syncEnabled) return;

    const onOnline = () => void syncManager.sync();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function")
      window.addEventListener("online", onOnline);

    let retryDelay = 5_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let currentSubscription: { unsubscribe: () => void } | null = null;
    let disposed = false;

    function subscribe() {
      currentSubscription = trpc.record.onRecordChange.subscribe(undefined, {
        onData: (event) => {
          if (event.data.type === "changed") {
            // Only a real event proves the stream works. Resetting on "connected"
            // too would pin a server that accepts-then-drops at a flat 5s loop.
            retryDelay = 5_000;
            void syncManager.sync();
          }
        },
        onError: () => {
          currentSubscription = null;
          if (disposed) return;
          const delay = retryDelay;
          retryDelay = Math.min(retryDelay * 2, 60_000);
          retryTimer = setTimeout(subscribe, delay);
        },
      });
    }

    subscribe();

    void syncManager.sync();
    // Fallback polling at 5 minutes (SSE handles real-time)
    syncManager.startPeriodicSync(5 * 60_000);

    return () => {
      disposed = true;
      currentSubscription?.unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function")
        window.removeEventListener("online", onOnline);
      syncManager.stopPeriodicSync();
    };
  }, [online, networkOffline, syncEnabled, syncManager, trpc]);

  async function saveAccount(
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    nextProfile?: LocalProfile,
  ) {
    // TODO: why set on vault and separate?
    await vault.setAccountKeyMaterial(material, vaults, nextProfile);
    setAccountKeyMaterial(material);
    if (nextProfile) setProfile(nextProfile);
  }

  async function removeVault() {
    await vault.clear();
    await clearLoginBundle();
    preferences.remove(PREF_KEYS.biometricDismissed);
    setProfile(null);
    setAccountKeyMaterial(null);
    setBiometricKeyMaterial(null);
  }

  const value: StoreContextValue = {
    vault,
    syncManager,

    profile,
    accountKeyMaterial,
    biometricKeyMaterial,
    biometricDismissed,

    needsBiometricEnroll,
    setBiometricDismissed,
    saveAccount,
    removeVault,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
