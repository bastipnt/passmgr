import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, MemberVault } from "@repo/schema";
import { clearLoginBundle, secretsStore, Vault } from "@repo/store";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { PREF_KEYS } from "../preferences/preference-keys";
import { SyncManager } from "../sync-manager";
import { initDecryptWorker } from "../util/decrypt-record";
import { useTRPCClient } from "../util/trpc";
import { usePreferences } from "./PreferencesProvider";
import { SessionContext } from "./SessionProvider";

type StoreContextValue = {
  vault: Vault;
  syncManager: SyncManager;

  /** The cached account key wrap + email: present once this device can unlock offline. */
  accountKeyMaterial: AccountKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  biometricDismissed: boolean;

  needsBiometricEnroll: boolean;
  setBiometricDismissed: (dismissed: boolean) => void;
  removeVault: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * A sync brought a changed vault list (a vault added, removed, renamed, rekeyed):
 * load its keys into memory and the decrypt worker. A vault whose wrap doesn't
 * open is skipped (its records stay hidden); a broken personal vault keeps the
 * keys loaded before.
 */
function reloadVaultKeys(vaults: MemberVault[]) {
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
  const { loggedIn, vaultUnlocked, isOffline } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const preferences = usePreferences();

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

  const syncManagerRef = useRef<SyncManager | null>(null);
  if (!syncManagerRef.current) {
    syncManagerRef.current = new SyncManager(
      vault,
      async (cursors) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false)
          throw new Error("offline");
        return await trpc.record.sync.query({ cursors });
      },
      reloadVaultKeys,
    );
  }
  const syncManager = syncManagerRef.current;

  // Load the account key material on mount to check if offline unlock is available
  useEffect(() => {
    void vault.getAccountKeyMaterial().then(setAccountKeyMaterial);
    void vault.getBiometricKeyMaterial().then(setBiometricKeyMaterial);
  }, [vault]);

  // Sync once the vault is unlocked + start periodic sync + SSE subscription + resync
  // when back online. Not right after the OPAQUE login: the unlock still has to
  // decide whose data the local DB holds (and may clear it), and a sync that
  // lands before that would be wiped with it.
  useEffect(() => {
    if (!loggedIn || !vaultUnlocked || isOffline || !syncEnabled) return;

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
  }, [loggedIn, vaultUnlocked, isOffline, syncEnabled, syncManager, trpc]);

  async function removeVault() {
    await vault.clear();
    await clearLoginBundle();
    secretsStore.lock();
    preferences.remove(PREF_KEYS.biometricDismissed);
    setAccountKeyMaterial(null);
    setBiometricKeyMaterial(null);
  }

  const value: StoreContextValue = {
    vault,
    syncManager,

    accountKeyMaterial,
    biometricKeyMaterial,
    biometricDismissed,

    needsBiometricEnroll,
    setBiometricDismissed,
    removeVault,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
