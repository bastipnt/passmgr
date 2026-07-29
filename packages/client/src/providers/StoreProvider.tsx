import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SyncManager } from "../sync-manager";
import { SessionContext } from "./SessionProvider";
import { usePreferences } from "./PreferencesProvider";
import { useTRPCClient } from "../util/trpc";
import { clearLoginBundle, secretsStore, Vault } from "@repo/store";
import type { BiometricKeyMaterial } from "@repo/crypto";
import type { VaultKeyMaterial } from "@repo/schema";

const BIOMETRIC_DISMISSED = "biometric-dismissed" as const;

type StoreContextValue = {
  vault: Vault;
  syncManager: SyncManager;

  vaultKeyMaterial: VaultKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  biometricDismissed: boolean;

  needsBiometricEnroll: boolean;
  setBiometricDismissed: (dismissed: boolean) => void;
  removeVault: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

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
  const { loggedIn, isOffline } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const preferences = usePreferences();

  const [vaultKeyMaterial, setVaultKeyMaterial] = useState<VaultKeyMaterial | null>(null);
  const [biometricKeyMaterial, setBiometricKeyMaterial] = useState<BiometricKeyMaterial | null>(
    null,
  );

  const [biometricDismissed, setBiometricDismissed_] = useState(
    Number(preferences.get(BIOMETRIC_DISMISSED)) === 1,
  );

  const needsBiometricEnroll = !biometricDismissed && biometricKeyMaterial === null;

  function setBiometricDismissed(dismissed: boolean) {
    setBiometricDismissed_(dismissed);

    if (dismissed) preferences.set(BIOMETRIC_DISMISSED, "1");
    else preferences.remove(BIOMETRIC_DISMISSED);
  }

  const syncManagerRef = useRef<SyncManager | null>(null);
  if (!syncManagerRef.current) {
    syncManagerRef.current = new SyncManager(vault, async (lastSyncedAt) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false)
        throw new Error("offline");
      return await trpc.record.sync.query({ lastSyncedAt });
    });
  }
  const syncManager = syncManagerRef.current;

  // Load vault key material on mount to check if offline unlock is available
  useEffect(() => {
    void vault.getVaultKeyMaterial().then(setVaultKeyMaterial);
    void vault.getBiometricKeyMaterial().then(setBiometricKeyMaterial);
  }, [vault]);

  // Sync on login + start periodic sync + SSE subscription + resync when back online
  useEffect(() => {
    if (!loggedIn || isOffline || !syncEnabled) return;

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
  }, [loggedIn, isOffline, syncEnabled, syncManager, trpc]);

  async function removeVault() {
    await vault.clear();
    await clearLoginBundle();
    secretsStore.lock();
    preferences.remove(BIOMETRIC_DISMISSED);
    setVaultKeyMaterial(null);
    setBiometricKeyMaterial(null);
  }

  const value: StoreContextValue = {
    vault,
    syncManager,

    vaultKeyMaterial,
    biometricKeyMaterial,
    biometricDismissed,

    needsBiometricEnroll,
    setBiometricDismissed,
    removeVault,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
