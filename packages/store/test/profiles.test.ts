import type { AccountKeyMaterial, EncryptedRecordSchema, MemberVault } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_DATABASE,
  ProfileExistsError,
  ProfileStore,
  profileDatabaseName,
  REGISTRY_DATABASE,
} from "../src/profiles";
import type { LocalProfile } from "../src/schema/profile-schema";
import { clearLoginBundle } from "../src/session-persistence";
import { createTestDatabases } from "./node-sqlite-driver";

vi.mock("../src/session-persistence", () => ({ clearLoginBundle: vi.fn() }));

const material: AccountKeyMaterial = {
  passwordKekParams: { t: 3, m: 65536, p: 4 },
  passwordKekSalt: "salt",
  encryptedAccountKey: "enc",
  accountKeyEncryptionNonce: "nonce",
  userKeyPair: {
    keyVersion: 1,
    publicKey: toBase64(new Uint8Array(32).fill(1)),
    encryptedPrivateKey: toBase64(new Uint8Array(48).fill(2)),
    privateKeyEncryptionNonce: toBase64(new Uint8Array(24).fill(3)),
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
  metaEncryptionNonce: "meta-nonce",
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
const LOCAL: LocalProfile = { profileId: "p-local", mode: "local", email: null, userId: null };

function record(recordId: string): EncryptedRecordSchema {
  return {
    recordId,
    vaultId: "v-personal",
    version: 1,
    encryptedData: `data-${recordId}`,
    encryptionNonce: `nonce-${recordId}`,
    cryptoVersion: 1,
    keyVersion: 1,
    clientUpdatedAt: "2026-10-01T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    deleted_at: null,
  };
}

let databases: ReturnType<typeof createTestDatabases>;
let store: ProfileStore;

beforeEach(() => {
  vi.mocked(clearLoginBundle).mockClear();
  databases = createTestDatabases();
  store = new ProfileStore(databases.open);
});

/** Add a profile the way an unlock does: its account key material and personal vault. */
async function add(profile: LocalProfile, name?: string) {
  return await store.create(
    profile,
    (vault) => vault.setAccountKeyMaterial(material, [personal], profile),
    { name },
  );
}

describe("ProfileStore registry", () => {
  it("starts empty, with only its own database", async () => {
    expect(await store.list()).toEqual([]);
    expect(databases.names()).toEqual([REGISTRY_DATABASE]);
  });

  it("deletes the pre-profile database once, never again", async () => {
    const legacy = databases.open(LEGACY_DATABASE);
    await legacy.query("CREATE TABLE records (recordId TEXT)", [], "run");
    await legacy.destroy();
    const open = vi.fn(databases.open);

    await new ProfileStore(open).list();
    expect(databases.names()).not.toContain(LEGACY_DATABASE);

    open.mockClear();
    await new ProfileStore(open).list();
    expect(open.mock.calls.map(([name]) => name)).toEqual([REGISTRY_DATABASE]);
  });

  it("creates a profile in its own database and lists it", async () => {
    const { entry, vault } = await add(LOCAL, "  Travel  ");

    expect(entry).toMatchObject({ ...LOCAL, name: "Travel" });
    expect(entry.databaseName).toBe(profileDatabaseName(LOCAL.profileId));
    expect(databases.names()).toContain(entry.databaseName);
    expect(await vault.getProfile()).toEqual(LOCAL);
    expect(await store.list()).toEqual([entry]);
  });

  it("lists the most recently used profile first", async () => {
    await add(ALICE);
    await add(BOB);
    await add(LOCAL);
    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ["Date"] });
    try {
      await store.open(ALICE.profileId);
    } finally {
      vi.useRealTimers();
    }

    expect((await store.list())[0]?.profileId).toBe(ALICE.profileId);
  });

  it("finds a linked profile by userId", async () => {
    await add(ALICE);
    await add(LOCAL);

    expect((await store.findByUserId("u-alice"))?.profileId).toBe(ALICE.profileId);
    expect(await store.findByUserId("u-bob")).toBeNull();
  });

  it("refuses a second profile for the same id or the same account", async () => {
    await add(ALICE);

    await expect(add(ALICE)).rejects.toBeInstanceOf(ProfileExistsError);
    await expect(add({ ...BOB, userId: ALICE.userId })).rejects.toThrow();
    // The refused profile's database is gone again.
    expect(databases.names()).not.toContain(profileDatabaseName(BOB.profileId));
    expect((await store.list()).map((p) => p.profileId)).toEqual([ALICE.profileId]);
  });

  it("deletes the database again when filling it fails", async () => {
    await expect(
      store.create(LOCAL, async () => {
        throw new Error("disk full");
      }),
    ).rejects.toThrow("disk full");

    expect(await store.list()).toEqual([]);
    expect(databases.names()).not.toContain(profileDatabaseName(LOCAL.profileId));
  });

  it("mirrors profile changes and renames", async () => {
    await add(ALICE);
    await store.update({ ...ALICE, email: "alice@new.example" });
    await store.rename(ALICE.profileId, "Work");

    expect(await store.get(ALICE.profileId)).toMatchObject({
      email: "alice@new.example",
      name: "Work",
    });
  });

  it("records the last export, none for a new profile", async () => {
    const { entry } = await add(LOCAL);
    expect(entry.lastExportAt).toBeNull();

    await store.markExported(LOCAL.profileId, new Date("2026-10-05T12:00:00.000Z"));

    expect((await store.get(LOCAL.profileId))?.lastExportAt).toBe("2026-10-05T12:00:00.000Z");
  });
});

describe("ProfileStore isolation", () => {
  it("keeps each profile's records in its own database", async () => {
    const alice = (await add(ALICE)).vault;
    const bob = (await add(BOB)).vault;
    await alice.upsertRecords([record("r-alice")]);
    await bob.upsertRecords([record("r-bob")]);

    expect((await alice.getAllLatest()).map((r) => r.recordId)).toEqual(["r-alice"]);
    expect((await bob.getAllLatest()).map((r) => r.recordId)).toEqual(["r-bob"]);
  });

  it("opens a profile's vault once and reopens its data after closing", async () => {
    const { vault } = await add(ALICE);
    await vault.upsertRecords([record("r1")]);

    expect(await store.open(ALICE.profileId)).toBe(vault);
    await store.close(ALICE.profileId);
    const reopened = await store.open(ALICE.profileId);

    expect(reopened).not.toBe(vault);
    expect((await reopened.getAllLatest()).map((r) => r.recordId)).toEqual(["r1"]);
  });

  it("runs withVault against a closed profile and closes it again", async () => {
    await add(ALICE);
    await store.close(ALICE.profileId);

    expect(await store.withVault(ALICE.profileId, (v) => v.getProfile())).toEqual(ALICE);
  });
});

describe("ProfileStore removal", () => {
  it("removes one profile: its database, persisted login and registry row", async () => {
    await add(ALICE);
    const { vault: bob } = await add(BOB);
    await bob.upsertRecords([record("r-bob")]);

    await store.remove(ALICE.profileId);

    expect((await store.list()).map((p) => p.profileId)).toEqual([BOB.profileId]);
    expect(databases.names()).not.toContain(profileDatabaseName(ALICE.profileId));
    expect(clearLoginBundle).toHaveBeenCalledWith(ALICE.profileId);
    expect((await bob.getAllLatest()).map((r) => r.recordId)).toEqual(["r-bob"]);
  });

  it("removes a profile that isn't open", async () => {
    await add(LOCAL);
    await store.close(LOCAL.profileId);

    await store.remove(LOCAL.profileId);

    expect(await store.list()).toEqual([]);
    expect(databases.names()).toEqual([REGISTRY_DATABASE]);
  });

  it("starts a removed profile over empty when it's added again", async () => {
    const { vault } = await add(ALICE);
    await vault.upsertRecords([record("r1")]);
    await store.remove(ALICE.profileId);

    const { vault: again } = await add(ALICE);
    expect(await again.getAllLatest()).toEqual([]);
  });

  it("removes all profiles", async () => {
    await add(ALICE);
    await add(BOB);
    await add(LOCAL);

    const removed = await store.removeAll();

    expect(removed.map((p) => p.profileId).sort()).toEqual(["p-alice", "p-bob", "p-local"]);
    expect(await store.list()).toEqual([]);
    expect(databases.names()).toEqual([REGISTRY_DATABASE]);
    expect(clearLoginBundle).toHaveBeenCalledTimes(3);
  });
});
