import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, MemberVault, RecoveryKeySchema } from "@repo/schema";
import {
  clearLoginBundle,
  type LocalProfile,
  type PendingChange,
  secretsStore,
  Vault,
} from "@repo/store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PREF_KEYS } from "../preferences/preference-keys";
import { RecordRepository } from "../records/record-repository";
import { resolveRecordConflict } from "../records/resolve-record-conflict";
import { SyncManager } from "../sync-manager";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { isNotFound, isServerAnswer, isUnauthorized } from "../util/trpc-errors";
import { usePreferences } from "./PreferencesProvider";
import { SessionContext } from "./SessionProvider";

type StoreContextValue = {
  vault: Vault;
  syncManager: SyncManager;
  /** Local-first record reads and writes (ADR 0001 D1). */
  records: RecordRepository;

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
   * Set up a vault on this device only (`local` profile, ADR 0001 D2) and update
   * `profile` / `accountKeyMaterial`. Rejects when the device already holds one.
   */
  createLocalVault: (
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
    vaults: readonly MemberVault[],
    profile: Extract<LocalProfile, { mode: "local" }>,
  ) => Promise<void>;
  /**
   * Delete the local vault, profile, persisted login and biometric enrollment.
   * Doesn't lock: an unlocked caller locks first (`useRemoveFromDevice`).
   */
  removeVault: () => Promise<void>;
  /**
   * Forget what unlocks this device without the password: the biometric
   * enrollment and the persisted login. Keeps the vault and its data.
   */
  forgetQuickUnlock: () => Promise<void>;
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
    // Requests fail fast offline, and an expired session detaches the server.
    async function request<T>(send: () => Promise<T>): Promise<T> {
      if (typeof navigator !== "undefined" && navigator.onLine === false)
        throw new Error("offline");
      try {
        return await send();
      } catch (e) {
        if (isUnauthorized(e)) onUnauthorized();
        throw e;
      }
    }

    /**
     * Interim push over the per-record mutations until `record.push` lands
     * (ADR 0001 D8): a pending version is a create (version 1), an update of
     * the version below it (restoring the record if that one is a tombstone),
     * or a tombstone of the version below it. Updates and deletes fail with
     * CONFLICT when the server moved on; the pull then merges (D5).
     */
    async function pushChange({ record }: PendingChange) {
      const { recordId, vaultId, encryptedData, encryptionNonce, cryptoVersion } = record;
      const body = { recordId, encryptedData, encryptionNonce, cryptoVersion };
      const clientUpdatedAt = record.clientUpdatedAt;

      if (record.deleted_at) {
        try {
          await request(() => trpc.record.delete.mutate({ recordId, version: record.version - 1 }));
        } catch (e) {
          // Deleted on the server already (or never got there): nothing left to do.
          if (!isNotFound(e)) throw e;
        }
        return null;
      }
      if (record.version === 1) {
        return await request(() =>
          trpc.record.create.mutate({ ...body, vaultId, clientUpdatedAt }),
        );
      }
      return await request(() =>
        trpc.record.update.mutate({ ...body, version: record.version - 1, clientUpdatedAt }),
      );
    }

    syncManagerRef.current = new SyncManager(vault, {
      pull: (cursors) => request(() => trpc.record.sync.query({ cursors })),
      push: pushChange,
      // Offline, a network failure, an unsigned request (locked) or a rejected
      // session: every other change would fail the same way.
      stopsRound: (e) => !isServerAnswer(e) || isUnauthorized(e),
      onVaultsChanged: reloadVaultKeys,
      resolveConflict: resolveRecordConflict,
    });
  }
  const syncManager = syncManagerRef.current;

  const recordsRef = useRef<RecordRepository | null>(null);
  recordsRef.current ??= new RecordRepository(vault, () => syncManager.requestSync());
  const records = recordsRef.current;

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
    syncManager.setEnabled(true);

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
      syncManager.setEnabled(false);
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

  async function createLocalVault(
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
    vaults: readonly MemberVault[],
    nextProfile: Extract<LocalProfile, { mode: "local" }>,
  ) {
    await vault.createLocalVault(material, recovery, vaults, nextProfile);
    setAccountKeyMaterial(material);
    setProfile(nextProfile);
  }

  async function removeVault() {
    await vault.clear();
    await clearLoginBundle();
    preferences.remove(PREF_KEYS.biometricDismissed);
    setProfile(null);
    setAccountKeyMaterial(null);
    setBiometricKeyMaterial(null);
  }

  async function forgetQuickUnlock() {
    await vault.clearBiometricKeyMaterial();
    await clearLoginBundle();
    setBiometricKeyMaterial(null);
  }

  const value: StoreContextValue = {
    vault,
    syncManager,
    records,

    profile,
    accountKeyMaterial,
    biometricKeyMaterial,
    biometricDismissed,

    needsBiometricEnroll,
    setBiometricDismissed,
    saveAccount,
    createLocalVault,
    removeVault,
    forgetQuickUnlock,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
