import { SessionContext, useStore } from "@repo/client";
import { biometricDismissedKey } from "@repo/client/src/preferences/preference-keys";
import { StoreProvider } from "@repo/client/src/providers/StoreProvider";
import type { AccountKeyMaterial, EncryptedRecordSchema, MemberVault } from "@repo/schema";
import { type LocalProfile, ProfileStore, secretsStore } from "@repo/store";
import { createTestDatabases } from "@repo/store/testing";
import { toBase64 } from "@repo/util";
import { act, waitFor } from "@testing-library/react";
import type { ContextType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";

// The real StoreProvider over a real ProfileStore (node:sqlite files); only the
// server and the session are replaced.
const trpcClient = {
  record: {
    sync: { query: vi.fn() },
    push: { mutate: vi.fn() },
    onRecordChange: { subscribe: vi.fn(() => ({ unsubscribe: () => undefined })) },
  },
};
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpcClient,
}));

const b64 = (bytes: number) => toBase64(new Uint8Array(bytes).fill(1));

const material: AccountKeyMaterial = {
  passwordKekParams: { t: 3, m: 65536, p: 4 },
  passwordKekSalt: b64(32),
  encryptedAccountKey: b64(48),
  accountKeyEncryptionNonce: b64(24),
  userKeyPair: {
    keyVersion: 1,
    publicKey: b64(32),
    encryptedPrivateKey: b64(48),
    privateKeyEncryptionNonce: b64(24),
  },
};
const personal: MemberVault = {
  vaultId: "v-personal",
  kind: "personal",
  role: "owner",
  keyVersion: 1,
  encryptedVaultKey: "enc",
  vaultKeyEncryptionNonce: "nonce",
  encryptedMeta: "meta",
  metaEncryptionNonce: "mn",
  previousKeys: [],
};
const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};
const BOB: LocalProfile = {
  profileId: "p-bob",
  mode: "linked",
  email: "bob@example.com",
  userId: "u-bob",
};

function record(recordId: string): EncryptedRecordSchema {
  return {
    recordId,
    vaultId: "v-personal",
    version: 1,
    encryptedData: "data",
    encryptionNonce: "nonce",
    cryptoVersion: 1,
    keyVersion: 1,
    clientUpdatedAt: "2026-10-01T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    deleted_at: null,
  };
}

let databases: ReturnType<typeof createTestDatabases>;
let profiles: ProfileStore;
let store: ReturnType<typeof useStore>;

function Probe() {
  store = useStore();
  return null;
}

const session = {
  vaultUnlocked: false,
  networkOffline: false,
  detachServer: vi.fn(),
} as unknown as ContextType<typeof SessionContext>;

async function launch() {
  renderWithProviders(
    <SessionContext.Provider value={session}>
      <StoreProvider profiles={profiles}>
        <Probe />
      </StoreProvider>
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(store.loaded).toBe(true));
}

/** A profile on the device, as an earlier login left it, with one record. */
async function seed(profile: LocalProfile, recordId: string) {
  const { vault } = await profiles.create(profile, (v) =>
    v.setAccountKeyMaterial(material, [personal], profile),
  );
  await vault.upsertRecords([record(recordId)]);
  await profiles.close(profile.profileId);
}

beforeEach(async () => {
  vi.clearAllMocks();
  secretsStore.lock();
  localStorage.clear();
  databases = createTestDatabases();
  profiles = new ProfileStore(databases.open);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StoreProvider profiles (ADR 0001 D2)", () => {
  it("starts without a profile on a new device", async () => {
    await launch();

    expect(store.profiles).toEqual([]);
    expect(store.active).toBeNull();
    expect(store.vault).toBeNull();
  });

  it("opens the last used profile on launch, with what its unlock needs", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await profiles.open(BOB.profileId);
    await profiles.close(BOB.profileId);

    await launch();

    await waitFor(() => expect(store.active?.entry.profileId).toBe(BOB.profileId));
    expect(store.profiles.map((p) => p.profileId)).toEqual([BOB.profileId, ALICE.profileId]);
    expect(store.profile).toEqual(BOB);
    expect(store.accountKeyMaterial).toEqual(material);
  });

  it("keeps each profile's records to itself when switching", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();

    await act(() => store.selectProfile(ALICE.profileId));
    expect((await store.vault!.getAllLatest()).map((r) => r.recordId)).toEqual(["r-alice"]);

    await act(() => store.selectProfile(BOB.profileId));
    expect((await store.vault!.getAllLatest()).map((r) => r.recordId)).toEqual(["r-bob"]);
  });

  it("stops the previous profile's sync when switching", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await act(() => store.selectProfile(ALICE.profileId));
    const previous = store.syncManager!;
    const onSync = vi.fn();
    previous.onSync(onSync);

    await act(() => store.selectProfile(BOB.profileId));

    expect(store.syncManager).not.toBe(previous);
    expect(previous.getStatus().phase).toBe("offline");
    // Disposed: a sync of the old manager tells nobody anything.
    await previous.sync();
    expect(onSync).not.toHaveBeenCalled();
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
  });

  it("runs concurrent switches one after another, leaving one profile open", async () => {
    const CAROL: LocalProfile = { ...BOB, profileId: "p-carol", userId: "u-carol" };
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await seed(CAROL, "r-carol");
    await launch();
    await waitFor(() => expect(store.active).not.toBeNull());
    const close = vi.spyOn(profiles, "close");

    await act(async () => {
      await Promise.all([store.selectProfile(ALICE.profileId), store.selectProfile(BOB.profileId)]);
    });

    expect(store.active?.entry.profileId).toBe(BOB.profileId);
    expect(close.mock.calls.map(([id]) => id)).toContain(ALICE.profileId);
    expect((profiles as unknown as { opened: Map<string, unknown> }).opened.size).toBe(1);
  });

  it("waits for a running sync round before closing the profile it syncs", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await act(() => store.selectProfile(ALICE.profileId));
    let answer!: (page: unknown) => void;
    trpcClient.record.sync.query.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const close = vi.spyOn(profiles, "close");
    const round = store.syncManager!.sync();
    await waitFor(() => expect(trpcClient.record.sync.query).toHaveBeenCalled());

    let switched = false;
    const switching = store.selectProfile(BOB.profileId).then(() => {
      switched = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(switched).toBe(false);
    expect(close).not.toHaveBeenCalled();

    answer({ records: [], vaults: [personal], cursors: {}, hasMore: false, serverTimestamp: "" });
    await act(() => switching);
    expect(await round).toBe(true);
    expect(close).toHaveBeenCalledWith(ALICE.profileId);
    expect(store.active?.entry.profileId).toBe(BOB.profileId);
  });

  it("refuses to switch while the vault is unlocked", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await waitFor(() => expect(store.active).not.toBeNull());
    const before = store.active?.entry.profileId;
    vi.spyOn(secretsStore, "isVaultUnlocked", "get").mockReturnValue(true);

    const other = before === ALICE.profileId ? BOB.profileId : ALICE.profileId;
    await expect(store.selectProfile(other)).rejects.toThrow(/lock/i);
    expect(store.active?.entry.profileId).toBe(before);
  });

  it("opens the existing profile for a known account: no new database, nothing wiped", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    const before = databases.names();

    await act(async () => {
      await store.openAccountProfile({ userId: ALICE.userId, email: ALICE.email }, material, [
        personal,
      ]);
    });

    expect(store.active?.entry.profileId).toBe(ALICE.profileId);
    expect(databases.names()).toEqual(before);
    expect((await store.vault!.getAllLatest()).map((r) => r.recordId)).toEqual(["r-alice"]);
  });

  it("adds a profile for an account new to this device, next to the others", async () => {
    await seed(ALICE, "r-alice");
    await launch();

    await act(async () => {
      await store.openAccountProfile({ userId: "u-carol", email: "carol@example.com" }, material, [
        personal,
      ]);
    });

    expect(store.profiles).toHaveLength(2);
    expect(store.profile).toMatchObject({ mode: "linked", userId: "u-carol" });
    expect(await store.vault!.getAllLatest()).toEqual([]);
    // Alice's profile is untouched.
    expect(
      (await profiles.withVault(ALICE.profileId, (v) => v.getAllLatest())).map((r) => r.recordId),
    ).toEqual(["r-alice"]);
  });

  it("updates the registry when a known account's email changed", async () => {
    await seed(ALICE, "r-alice");
    await launch();

    await act(async () => {
      await store.openAccountProfile(
        { userId: ALICE.userId, email: "alice@new.example" },
        material,
        [personal],
      );
    });

    expect(store.profiles[0]?.email).toBe("alice@new.example");
    expect(store.profile?.email).toBe("alice@new.example");
  });

  it("adds a local vault as its own profile, with its name", async () => {
    await seed(ALICE, "r-alice");
    await launch();
    const local = { profileId: "p-local", mode: "local", email: null, userId: null } as const;

    await act(() =>
      store.createLocalVault(
        material,
        {
          recoveryKekSalt: b64(32),
          recoveryVerifier: b64(32),
          encryptedAccountKeyRecovery: b64(48),
          accountKeyEncryptionNonceRecovery: b64(24),
        },
        [personal],
        local,
        "Travel",
      ),
    );

    expect(store.active?.entry).toMatchObject({ profileId: "p-local", name: "Travel" });
    expect(store.profiles).toHaveLength(2);
  });

  it("removes the active profile and opens the next one; its preferences go with it", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await act(() => store.selectProfile(ALICE.profileId));
    act(() => store.setBiometricDismissed(true));
    expect(localStorage.getItem(biometricDismissedKey(ALICE.profileId))).toBe("1");

    await act(() => store.removeProfile(ALICE.profileId));

    expect(store.profiles.map((p) => p.profileId)).toEqual([BOB.profileId]);
    expect(store.active?.entry.profileId).toBe(BOB.profileId);
    expect(localStorage.getItem(biometricDismissedKey(ALICE.profileId))).toBeNull();
    expect(databases.names()).not.toContain(`pass-mgr-${ALICE.profileId}`);
  });

  it("counts a closed profile's unsynced changes without making it active", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await act(() => store.selectProfile(BOB.profileId));

    expect(await store.countPendingChanges(ALICE.profileId)).toBe(0);
    expect(store.active?.entry.profileId).toBe(BOB.profileId);
  });

  it("removes every profile", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();

    await act(() => store.removeAllProfiles());

    expect(store.profiles).toEqual([]);
    expect(store.active).toBeNull();
    expect(databases.names()).toEqual(["pass-mgr-profiles"]);
  });

  it("dismisses biometric enrollment per profile", async () => {
    await seed(ALICE, "r-alice");
    await seed(BOB, "r-bob");
    await launch();
    await act(() => store.selectProfile(ALICE.profileId));
    act(() => store.setBiometricDismissed(true));
    expect(store.needsBiometricEnroll).toBe(false);

    await act(() => store.selectProfile(BOB.profileId));
    expect(store.biometricDismissed).toBe(false);
    expect(store.needsBiometricEnroll).toBe(true);
  });
});
