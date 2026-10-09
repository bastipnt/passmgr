import type { ActiveProfile } from "@repo/client";
import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, MemberVault, RecoveryKeySchema } from "@repo/schema";
import type { LocalProfile, ProfileEntry } from "@repo/store";
import { type Mock, vi } from "vitest";

export type FakeVault = {
  getVaults: Mock<() => Promise<MemberVault[]>>;
  getProfile: Mock;
  getAccountKeyMaterial: Mock;
  getRecoveryKeyMaterial: Mock;
  countPendingChanges: Mock<() => Promise<number>>;
  setBiometricKeyMaterial: Mock;
  clearBiometricKeyMaterial: Mock;
};

export function fakeVault(): FakeVault {
  return {
    getVaults: vi.fn(async () => []),
    getProfile: vi.fn(async () => null),
    getAccountKeyMaterial: vi.fn(async () => null),
    getRecoveryKeyMaterial: vi.fn(async () => null),
    countPendingChanges: vi.fn(async () => 0),
    setBiometricKeyMaterial: vi.fn(),
    clearBiometricKeyMaterial: vi.fn(),
  };
}

export function profileEntry(profile: LocalProfile, name: string | null = null): ProfileEntry {
  return {
    ...profile,
    name,
    databaseName: `pass-mgr-${profile.profileId}`,
    createdAt: "2026-10-01T00:00:00.000Z",
    lastUsedAt: "2026-10-01T00:00:00.000Z",
    lastExportAt: null,
  };
}

/**
 * Stand-in for `useStore()` with the multi-profile shape (ADR 0001 D2): the
 * active profile is whatever `profile` / `accountKeyMaterial` /
 * `biometricKeyMaterial` say, backed by the one `vault` mock; `profiles` is
 * the registry. Switching (`selectProfile`, `openAccountProfile`) rewrites
 * `profile`, so tests assert on it and on the method mocks.
 */
export function createFakeStore() {
  const syncManager = {
    onSync: () => () => undefined,
    onStatusChange: () => () => undefined,
    getStatus: () => ({
      phase: "idle",
      pending: 0,
      parked: 0,
      error: null,
      lastSyncedAt: null,
      enabled: true,
    }),
  };
  const records = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    move: vi.fn(),
    history: vi.fn(async () => []),
    heads: vi.fn(async () => []),
    writeImport: vi.fn(async () => []),
  };

  const store = {
    loaded: true,
    profiles: [] as ProfileEntry[],
    profile: null as LocalProfile | null,
    accountKeyMaterial: null as AccountKeyMaterial | null,
    biometricKeyMaterial: null as BiometricKeyMaterial | null,
    needsBiometricEnroll: false,
    biometricDismissed: false,
    vault: fakeVault(),
    syncManager,
    records,

    get active(): ActiveProfile | null {
      const { profile } = store;
      if (!profile) return null;
      const entry =
        store.profiles.find((p) => p.profileId === profile.profileId) ?? profileEntry(profile);
      return {
        entry,
        vault: store.vault,
        syncManager,
        records,
        profile,
        accountKeyMaterial: store.accountKeyMaterial,
        biometricKeyMaterial: store.biometricKeyMaterial,
      } as unknown as ActiveProfile;
    },
    current: () => store.active,
    needsBiometricEnrollFor: () => store.needsBiometricEnroll,
    setBiometricDismissed: vi.fn(),

    selectProfile: vi.fn(async (profileId: string) => {
      const entry = store.profiles.find((p) => p.profileId === profileId);
      if (!entry) throw new Error(`No profile ${profileId}`);
      // Every profile shares the one key material and vault mock.
      store.profile = { ...entry } as LocalProfile;
      return store.active!;
    }),
    openAccountProfile: vi.fn(
      async (
        account: { userId: string; email: string },
        material: AccountKeyMaterial,
        _vaults: readonly MemberVault[],
      ) => {
        const existing = store.profiles.find((p) => p.userId === account.userId);
        const profile: LocalProfile = {
          profileId: existing?.profileId ?? `profile-${account.userId}`,
          mode: "linked",
          ...account,
        };
        if (!existing) store.profiles = [...store.profiles, profileEntry(profile)];
        store.profile = profile;
        store.accountKeyMaterial = material;
        return store.active!;
      },
    ),
    saveAccount: vi.fn(
      async (
        profileId: string,
        material: AccountKeyMaterial,
        _vaults: readonly MemberVault[],
        _profile?: LocalProfile,
      ) => {
        if (store.profile?.profileId === profileId) store.accountKeyMaterial = material;
      },
    ),
    saveLocalKeyMaterial: vi.fn(
      async (profileId: string, material: AccountKeyMaterial, _recovery: RecoveryKeySchema) => {
        if (store.profile?.profileId === profileId) store.accountKeyMaterial = material;
      },
    ),
    createLocalVault: vi.fn(),
    countPendingChanges: vi.fn(async () => 0),
    removeProfile: vi.fn(),
    removeAllProfiles: vi.fn(),
    saveBiometricKeyMaterial: vi.fn(),
    forgetQuickUnlock: vi.fn(),
    markExported: vi.fn(),
  };
  return store;
}

export type FakeStore = ReturnType<typeof createFakeStore>;
