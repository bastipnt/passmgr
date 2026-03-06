import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LocalStore,
  SyncManager,
  type BiometricKeyMaterial,
  type VaultKeyMaterial,
} from "@repo/store";
import { SessionContext, useTRPCClient } from "@repo/client";
import { SqliteAdapter } from "./sqlite-adapter";

type StoreContextValue = {
  localStore: LocalStore;
  syncManager: SyncManager;
  vaultKeyMaterial: VaultKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useLocalStore(): StoreContextValue | null {
  return useContext(StoreContext);
}

type StoreProviderProps = {
  children: ReactNode;
};

export default function StoreProvider({ children }: StoreProviderProps) {
  const { sessionId, vaultReady, isOffline } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  const [vaultKeyMaterial, setVaultKeyMaterial] = useState<VaultKeyMaterial | null>(null);
  const [biometricKeyMaterial, setBiometricKeyMaterial] = useState<BiometricKeyMaterial | null>(
    null,
  );

  const storeRef = useRef<{ localStore: LocalStore; syncManager: SyncManager } | null>(null);

  if (!storeRef.current) {
    const adapter = new SqliteAdapter();
    const localStore = new LocalStore(adapter);
    const syncManager = new SyncManager(localStore, async (lastSyncedAt) => {
      if (!navigator.onLine) throw new Error("offline");
      return await trpc.entry.sync.query({ lastSyncedAt });
    });
    storeRef.current = { localStore, syncManager };
  }

  const { localStore, syncManager } = storeRef.current;

  // Load vault key material on mount to check if offline unlock is available
  useEffect(() => {
    void localStore.getVaultKeyMaterial().then(setVaultKeyMaterial);
    void localStore.getBiometricKeyMaterial().then(setBiometricKeyMaterial);
  }, [localStore]);

  // Sync on login + start periodic sync + resync when back online (skip when offline-only)
  useEffect(() => {
    if (!sessionId || isOffline) return;

    const unsub = syncManager.onSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    });

    const onOnline = () => void syncManager.sync();
    window.addEventListener("online", onOnline);

    void syncManager.sync();
    syncManager.startPeriodicSync(60_000);

    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      syncManager.stopPeriodicSync();
    };
  }, [sessionId, isOffline, syncManager, queryClient]);

  // Re-sync when vault becomes ready (items may have been fetched but not decryptable yet)
  useEffect(() => {
    if (vaultReady) {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    }
  }, [vaultReady, queryClient]);

  const value: StoreContextValue = {
    ...storeRef.current,
    vaultKeyMaterial,
    biometricKeyMaterial,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
