import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, MemberVault, RecoveryKeySchema } from "@repo/schema";
import {
  clearLoginBundle,
  createLock,
  type LocalProfile,
  type ProfileEntry,
  type ProfileStore,
  secretsStore,
  type Vault,
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
import { biometricDismissedKey } from "../preferences/preference-keys";
import { RecordRepository } from "../records/record-repository";
import { resolveRecordConflict } from "../records/resolve-record-conflict";
import { SyncManager } from "../sync-manager";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import {
  isRetryLater,
  isServerAnswer,
  isServerError,
  isThrottled,
  isUnauthorized,
} from "../util/trpc-errors";
import { usePreferences } from "./PreferencesProvider";
import { SessionContext } from "./SessionProvider";

/**
 * The profile this app works on (ADR 0001 D2, amended 2026-10-07): its open
 * database, the sync and record access bound to it, and what it holds for an
 * unlock. One at a time; switching closes the previous one.
 */
export type ActiveProfile = {
  entry: ProfileEntry;
  vault: Vault;
  syncManager: SyncManager;
  /** Local-first record reads and writes (ADR 0001 D1). */
  records: RecordRepository;
  /** The profile row in its database; null when it's missing or malformed. */
  profile: LocalProfile | null;
  /** The cached account key wrap: present once the profile can unlock without the server. */
  accountKeyMaterial: AccountKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
};

type StoreContextValue = {
  /** Every profile on this device, the most recently used first. */
  profiles: ProfileEntry[];
  /** False until the profile list was read and the last used profile opened. */
  loaded: boolean;
  /** The selected profile; null while the device holds none (or none is picked yet). */
  active: ActiveProfile | null;
  /**
   * The active profile as of now, not as of the caller's render: async flows
   * that switch profiles (sign in, create a vault) read it after the switch.
   */
  current: () => ActiveProfile | null;

  // The active profile's, for convenience. Null without one.
  vault: Vault | null;
  syncManager: SyncManager | null;
  records: RecordRepository | null;
  profile: LocalProfile | null;
  accountKeyMaterial: AccountKeyMaterial | null;
  biometricKeyMaterial: BiometricKeyMaterial | null;
  biometricDismissed: boolean;
  needsBiometricEnroll: boolean;
  /** `needsBiometricEnroll` of a profile just opened (the render's value is the previous one's). */
  needsBiometricEnrollFor: (profile: ActiveProfile) => boolean;
  setBiometricDismissed: (dismissed: boolean) => void;

  /**
   * Make another profile the active one. Only while locked: the keys in memory
   * belong to the active profile (lock first, `useLock`). Resolves the newly
   * active profile.
   */
  selectProfile: (profileId: string) => Promise<ActiveProfile>;
  /**
   * After an online login: open the account's profile (same `userId`), or add
   * one for an account this device hasn't seen, and store the account key wrap
   * and the vaults in it. Never touches another profile. Locked only.
   */
  openAccountProfile: (
    account: { userId: string; email: string },
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
  ) => Promise<ActiveProfile>;
  /**
   * Store the account key wrap and the vaults (and, when given, a changed
   * profile row) in a profile, atomically, and update the state to match. The
   * profile is named: a background write (a rekey) lands in the profile it
   * was made for, even when another one was opened meanwhile.
   */
  saveAccount: (
    profileId: string,
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    profile?: LocalProfile,
  ) => Promise<void>;
  /**
   * Add a profile with a vault on this device only (`local`, ADR 0001 D2) next
   * to the others and make it the active one. Locked only.
   */
  createLocalVault: (
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
    vaults: readonly MemberVault[],
    profile: Extract<LocalProfile, { mode: "local" }>,
    name?: string,
  ) => Promise<void>;
  /**
   * How many changes of a profile haven't reached the server (what removing it
   * would lose). Opens it briefly when it isn't the active one.
   */
  countPendingChanges: (profileId: string) => Promise<number>;
  /**
   * Remove a profile from this device: its database, persisted login and
   * biometric enrollment. Doesn't lock: an unlocked caller locks first
   * (`useRemoveFromDevice`). Removing the active profile activates the next
   * most recently used one, if any.
   */
  removeProfile: (profileId: string) => Promise<void>;
  /** Remove every profile (see `removeProfile`). Locked only. */
  removeAllProfiles: () => Promise<void>;
  /** Store the active profile's biometric enrollment (web, WebAuthn PRF). */
  saveBiometricKeyMaterial: (material: BiometricKeyMaterial) => Promise<void>;
  /**
   * Forget what unlocks a profile (default: the active one) without the
   * password: its biometric enrollment and persisted login. Keeps its data.
   */
  forgetQuickUnlock: (profileId?: string) => Promise<void>;
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

/** The active profile, for code that only runs with one (an unlocked vault). */
export function requireActive(store: Pick<StoreContextValue, "current">): ActiveProfile {
  const active = store.current();
  if (!active) throw new Error("No profile is open");
  return active;
}

function assertLocked() {
  if (secretsStore.isVaultUnlocked) throw new Error("Lock the vault before switching profiles");
}

type StoreProviderProps = {
  profiles: ProfileStore;
  /**
   * Gates the SSE subscription and periodic sync. Mobile passes the app's
   * foreground state — the OS suspends sockets and timers in the background, so
   * the stream has to be torn down and re-established rather than left to rot.
   */
  syncEnabled?: boolean;
  children: ReactNode;
};

export function StoreProvider({ profiles, syncEnabled = true, children }: StoreProviderProps) {
  const { mode, networkOffline, detachServer } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const preferences = usePreferences();

  const [entries, setEntries] = useState<ProfileEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActiveState] = useState<ActiveProfile | null>(null);
  const activeRef = useRef<ActiveProfile | null>(null);
  // Bumped to re-read the (synchronous) preferences after a write.
  const [, setPreferencesRevision] = useState(0);

  const setActive = useCallback((next: ActiveProfile | null) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);
  const current = useCallback(() => activeRef.current, []);

  const isDismissed = (profile: ActiveProfile) =>
    Number(preferences.get(biometricDismissedKey(profile.entry.profileId))) === 1;
  const needsBiometricEnrollFor = (profile: ActiveProfile) =>
    !isDismissed(profile) && profile.biometricKeyMaterial === null;
  const biometricDismissed = active !== null && isDismissed(active);
  const needsBiometricEnroll = active !== null && needsBiometricEnrollFor(active);

  function setBiometricDismissed(dismissed: boolean) {
    const profile = activeRef.current;
    if (!profile) return;
    const key = biometricDismissedKey(profile.entry.profileId);
    if (dismissed) preferences.set(key, "1");
    else preferences.remove(key);
    setPreferencesRevision((r) => r + 1);
  }

  // The server no longer accepts the session (expired, revoked): go offline
  // instead of locking, and stop persisting the dead session.
  const detachRef = useRef(detachServer);
  detachRef.current = detachServer;
  const trpcRef = useRef(trpc);
  trpcRef.current = trpc;

  /** The sync and record access of one profile's vault. */
  const bind = useCallback((vault: Vault) => {
    function onUnauthorized() {
      detachRef.current();
      const profileId = activeRef.current?.entry.profileId;
      if (profileId) void persistSession(profileId);
    }

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

    const syncManager = new SyncManager(vault, {
      pull: (cursors) => request(() => trpcRef.current.record.sync.query({ cursors })),
      push: async (changes) =>
        (await request(() => trpcRef.current.record.push.mutate({ changes }))).results,
      // Offline, a network failure, an unsigned request (locked), a rejected
      // session, a busy, throttling or failing server: every other batch would
      // fail the same way. Only an answer about the batch itself (a 4xx) is
      // split down to the bad change and counted against it.
      stopsRound: (e) =>
        !isServerAnswer(e) ||
        isUnauthorized(e) ||
        isRetryLater(e) ||
        isThrottled(e) ||
        isServerError(e),
      isOffline: (e) => !isServerAnswer(e),
      onVaultsChanged: reloadVaultKeys,
      resolveConflict: resolveRecordConflict,
    });
    const records = new RecordRepository(vault, () => syncManager.requestSync());
    return { syncManager, records };
  }, []);

  /** Read what the profile's database holds for an unlock. */
  const load = useCallback(
    async (entry: ProfileEntry, vault: Vault): Promise<ActiveProfile> => {
      const [profile, accountKeyMaterial, biometricKeyMaterial] = await Promise.all([
        vault.getProfile(),
        vault.getAccountKeyMaterial(),
        vault.getBiometricKeyMaterial(),
      ]);
      return { entry, vault, ...bind(vault), profile, accountKeyMaterial, biometricKeyMaterial };
    },
    [bind],
  );

  // Opening, adding and removing profiles run one at a time: two at once could
  // each close "the" active profile and leave the other's database open.
  const switchLock = useRef(createLock()).current;

  /** Stop the active profile's sync (waiting for a running round) and close its database. */
  const deactivate = useCallback(async () => {
    const previous = activeRef.current;
    if (!previous) return;
    setActive(null);
    await previous.syncManager.dispose();
    await profiles.close(previous.entry.profileId);
  }, [profiles, setActive]);

  const refreshEntries = useCallback(async () => {
    const list = await profiles.list();
    setEntries(list);
    return list;
  }, [profiles]);

  /** Make a profile the active one. Only under `switchLock`. */
  const activate = useCallback(
    async (profileId: string, vault?: Vault): Promise<ActiveProfile> => {
      const previous = activeRef.current;
      if (previous?.entry.profileId !== profileId) await deactivate();
      const opened = vault ?? (await profiles.open(profileId));
      const entry = (await refreshEntries()).find((p) => p.profileId === profileId);
      if (!entry) throw new Error(`No profile ${profileId} on this device`);
      const next = await load(entry, opened);
      // Reopened (same profile): its previous sync gives way to the new one.
      if (previous?.entry.profileId === profileId) await previous.syncManager.dispose();
      setActive(next);
      return next;
    },
    [deactivate, profiles, refreshEntries, load, setActive],
  );

  // On launch: list the profiles and open the last used one, so the unlock
  // screen offers it.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await switchLock(async () => {
          const [last] = await refreshEntries();
          if (last && live && !activeRef.current) await activate(last.profileId);
        });
      } catch (e) {
        console.error("Loading the profiles on this device failed", e);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [refreshEntries, activate, switchLock]);

  // Sync once the vault is unlocked with a server session (`online`) + start
  // periodic sync + SSE subscription + resync when back online. Not right after
  // the OPAQUE login: the unlock still has to open the account's profile, and
  // a sync that lands before that would write into another profile. `local`
  // and `offline` never reach the server.
  const online = mode === "online";
  const syncManager = active?.syncManager ?? null;
  useEffect(() => {
    if (!syncManager || !online || networkOffline || !syncEnabled) return;
    syncManager.setEnabled(true);

    const onOnline = () => void syncManager.sync();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function")
      window.addEventListener("online", onOnline);

    let retryDelay = 5_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let currentSubscription: { unsubscribe: () => void } | null = null;
    let disposed = false;

    let resubscribing = false;
    function subscribe() {
      currentSubscription = trpc.record.onRecordChange.subscribe(undefined, {
        onData: (event) => {
          // Back after a dropped stream: catch up on what changed meanwhile.
          if (event.data.type === "connected" && resubscribing) {
            resubscribing = false;
            void syncManager?.sync();
          }
          if (event.data.type === "changed") {
            // Only a real event proves the stream works. Resetting on "connected"
            // too would pin a server that accepts-then-drops at a flat 5s loop.
            retryDelay = 5_000;
            void syncManager?.sync();
          }
        },
        onError: () => {
          currentSubscription = null;
          if (disposed) return;
          const delay = retryDelay;
          retryDelay = Math.min(retryDelay * 2, 60_000);
          resubscribing = true;
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

  async function selectProfile(profileId: string) {
    return await switchLock(async () => {
      const previous = activeRef.current;
      if (previous?.entry.profileId === profileId) return previous;
      assertLocked();
      return await activate(profileId);
    });
  }

  async function openAccountProfile(
    account: { userId: string; email: string },
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
  ) {
    return await switchLock(() => openAccount(account, material, vaults));
  }

  async function openAccount(
    account: { userId: string; email: string },
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
  ) {
    assertLocked();
    const existing = await profiles.findByUserId(account.userId);
    if (existing) {
      const opened = await activate(existing.profileId);
      const profile: LocalProfile = {
        profileId: existing.profileId,
        mode: "linked",
        email: account.email,
        userId: account.userId,
      };
      const changed = opened.profile?.email !== account.email || opened.profile.mode !== "linked";
      await saveAccount(existing.profileId, material, vaults, changed ? profile : undefined);
      return requireActive({ current });
    }

    const profile: LocalProfile = {
      profileId: crypto.randomUUID(),
      mode: "linked",
      email: account.email,
      userId: account.userId,
    };
    const { vault } = await profiles.create(profile, (v) =>
      v.setAccountKeyMaterial(material, vaults, profile),
    );
    return await activate(profile.profileId, vault);
  }

  async function saveAccount(
    profileId: string,
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    nextProfile?: LocalProfile,
  ) {
    if (nextProfile && nextProfile.profileId !== profileId)
      throw new Error("A profile can't take another profile's row");
    await profiles.withVault(profileId, (vault) =>
      vault.setAccountKeyMaterial(material, vaults, nextProfile),
    );
    if (nextProfile) {
      await profiles.update(nextProfile);
      await refreshEntries();
    }
    const open = activeRef.current;
    if (open?.entry.profileId !== profileId) return;
    const entry = nextProfile
      ? {
          ...open.entry,
          mode: nextProfile.mode,
          email: nextProfile.email,
          userId: nextProfile.userId,
        }
      : open.entry;
    setActive({
      ...open,
      entry,
      accountKeyMaterial: material,
      profile: nextProfile ?? open.profile,
    });
  }

  async function createLocalVault(
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
    vaults: readonly MemberVault[],
    nextProfile: Extract<LocalProfile, { mode: "local" }>,
    name?: string,
  ) {
    await switchLock(async () => {
      assertLocked();
      const { vault } = await profiles.create(
        nextProfile,
        (v) => v.createLocalVault(material, recovery, vaults, nextProfile),
        { name },
      );
      await activate(nextProfile.profileId, vault);
    });
  }

  async function countPendingChanges(profileId: string) {
    const open = activeRef.current;
    if (open?.entry.profileId === profileId) return await open.vault.countPendingChanges();
    return await profiles.withVault(profileId, (vault) => vault.countPendingChanges());
  }

  async function removeProfile(profileId: string) {
    await switchLock(async () => {
      const wasActive = activeRef.current?.entry.profileId === profileId;
      if (wasActive) {
        assertLocked();
        await deactivate();
      }
      await profiles.remove(profileId);
      preferences.remove(biometricDismissedKey(profileId));
      const [next] = await refreshEntries();
      if (wasActive && next) await activate(next.profileId);
    });
  }

  async function removeAllProfiles() {
    await switchLock(async () => {
      assertLocked();
      await deactivate();
      const removed = await profiles.removeAll();
      for (const { profileId } of removed) preferences.remove(biometricDismissedKey(profileId));
      await refreshEntries();
    });
  }

  async function saveBiometricKeyMaterial(material: BiometricKeyMaterial) {
    const target = requireActive({ current });
    await target.vault.setBiometricKeyMaterial(material);
    if (activeRef.current?.vault === target.vault)
      setActive({ ...activeRef.current, biometricKeyMaterial: material });
  }

  async function forgetQuickUnlock(profileId = activeRef.current?.entry.profileId) {
    if (!profileId) return;
    const open = activeRef.current;
    if (open?.entry.profileId === profileId) {
      await open.vault.clearBiometricKeyMaterial();
      setActive({ ...open, biometricKeyMaterial: null });
    } else {
      await profiles.withVault(profileId, (vault) => vault.clearBiometricKeyMaterial());
    }
    await clearLoginBundle(profileId);
  }

  const value: StoreContextValue = {
    profiles: entries,
    loaded,
    active,
    current,

    vault: active?.vault ?? null,
    syncManager,
    records: active?.records ?? null,
    profile: active?.profile ?? null,
    accountKeyMaterial: active?.accountKeyMaterial ?? null,
    biometricKeyMaterial: active?.biometricKeyMaterial ?? null,
    biometricDismissed,
    needsBiometricEnroll,
    needsBiometricEnrollFor,
    setBiometricDismissed,

    selectProfile,
    openAccountProfile,
    saveAccount,
    createLocalVault,
    countPendingChanges,
    removeProfile,
    removeAllProfiles,
    saveBiometricKeyMaterial,
    forgetQuickUnlock,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
