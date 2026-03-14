import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SyncManager } from "../sync-manager";
import { SessionContext } from "./SessionProvider";
import { useTRPCClient } from "../util/trpc";
import { Vault } from "@repo/store";
import type { BiometricKeyMaterial } from "@repo/crypto";
import type { VaultKeyMaterial } from "@repo/schema";

const BIOMETRIC_DISMISSED = "biometric-dismissed" as const;

type StoreContextValue = {
  vault: Vault;
  syncManager: SyncManager;

  vaultKeyMaterial: VaultKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  biometricDismissed: boolean;

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
  children: ReactNode;
};

export function StoreProvider({ children }: StoreProviderProps) {
  const { sessionId, vaultReady, isOffline } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  const [vaultKeyMaterial, setVaultKeyMaterial] = useState<VaultKeyMaterial | null>(null);
  const [biometricKeyMaterial, setBiometricKeyMaterial] = useState<BiometricKeyMaterial | null>(
    null,
  );

  const [biometricDismissed, setBiometricDismissed_] = useState(
    Number(localStorage.getItem(BIOMETRIC_DISMISSED)) === 1,
  );

  function setBiometricDismissed(dismissed: boolean) {
    setBiometricDismissed_(dismissed);

    if (dismissed) localStorage.setItem(BIOMETRIC_DISMISSED, "1");
    else localStorage.removeItem(BIOMETRIC_DISMISSED);
  }

  const storeRef = useRef<{ vault: Vault; syncManager: SyncManager } | null>(null);

  if (!storeRef.current) {
    const vault = new Vault();
    const syncManager = new SyncManager(vault, async (lastSyncedAt) => {
      if (!navigator.onLine) throw new Error("offline");
      return await trpc.entry.sync.query({ lastSyncedAt });
    });
    storeRef.current = { vault, syncManager };
  }

  const { vault, syncManager } = storeRef.current;

  // Load vault key material on mount to check if offline unlock is available
  useEffect(() => {
    void vault.getVaultKeyMaterial().then(setVaultKeyMaterial);
    void vault.getBiometricKeyMaterial().then(setBiometricKeyMaterial);
  }, [vault]);

  // Sync on login + start periodic sync + SSE subscription + resync when back online
  useEffect(() => {
    if (!sessionId || isOffline) return;

    const unsub = syncManager.onSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    });

    const onOnline = () => void syncManager.sync();
    window.addEventListener("online", onOnline);

    // Subscribe to SSE notifications for real-time sync
    const sseSubscription = trpc.entry.onItemChange.subscribe(undefined, {
      onData: (event) => {
        if (event.data.type === "changed") {
          void syncManager.sync();
        }
      },
    });

    void syncManager.sync();
    // Fallback polling at 5 minutes (SSE handles real-time)
    syncManager.startPeriodicSync(5 * 60_000);

    return () => {
      unsub();
      sseSubscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      syncManager.stopPeriodicSync();
    };
  }, [sessionId, isOffline, syncManager, queryClient, trpc]);

  // Re-sync when vault becomes ready (items may have been fetched but not decryptable yet)
  useEffect(() => {
    if (vaultReady) {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    }
  }, [vaultReady, queryClient]);

  async function removeVault() {
    await vault.clear();
    localStorage.removeItem(BIOMETRIC_DISMISSED);
    setVaultKeyMaterial(null);
    setBiometricKeyMaterial(null);
  }

  const value: StoreContextValue = {
    ...storeRef.current,

    vaultKeyMaterial,
    biometricKeyMaterial,
    biometricDismissed,

    setBiometricDismissed,
    removeVault,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
