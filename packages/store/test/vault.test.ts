import type { BiometricKeyMaterial } from "@repo/crypto";
import type {
  AccountKeyMaterial,
  EncryptedRecordSchema,
  MemberVault,
  RecoveryKeySchema,
} from "@repo/schema";
import { toBase64 } from "@repo/util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalProfile } from "../src/schema/profile-schema";
import { sameVaults, Vault, VaultExistsError } from "../src/vault";
import { createTestDriver } from "./node-sqlite-driver";

let vault: Vault;

beforeEach(() => {
  vault = new Vault(createTestDriver());
});

afterEach(async () => {
  await vault.destroy();
});

function record(
  recordId: string,
  version: number,
  overrides: Partial<EncryptedRecordSchema> = {},
): EncryptedRecordSchema {
  return {
    recordId,
    vaultId: "v-personal",
    version,
    encryptedData: `data-${recordId}-${version}`,
    encryptionNonce: `nonce-${recordId}-${version}`,
    cryptoVersion: 1,
    keyVersion: 1,
    clientUpdatedAt: `2026-10-0${version}T00:00:00.000Z`,
    created_at: `2026-10-0${version}T00:00:00.000Z`,
    updated_at: `2026-10-0${version}T00:00:00.000Z`,
    deleted_at: null,
    ...overrides,
  };
}

const accountKey: AccountKeyMaterial = {
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

function vaultKey(vaultId: string, kind: MemberVault["kind"] = "shared"): MemberVault {
  return {
    vaultId,
    kind,
    role: "owner",
    keyVersion: 1,
    encryptedVaultKey: `enc-${vaultId}`,
    vaultKeyEncryptionNonce: `nonce-${vaultId}`,
    encryptedMeta: `meta-${vaultId}`,
    metaEncryptionNonce: `meta-nonce-${vaultId}`,
    previousKeys: [],
  };
}

const personal = vaultKey("v-personal", "personal");

const biometricKey: BiometricKeyMaterial = {
  biometricEncryptedAccountKey: "bak",
  biometricNonce: "bn",
  biometricEncryptedPassword: "bpw",
  biometricPasswordNonce: "bpn",
  credentialId: "cred",
  prfSalt: "prf",
};

describe("records", () => {
  it("getAllLatest returns the newest version per record with its first creation date", async () => {
    // Distinct earliest dates per record: a subquery that isn't grouped or
    // correlated per record would hand every record the global minimum.
    await vault.upsertRecords([
      record("r1", 1),
      record("r1", 2),
      record("r2", 1, { created_at: "2026-09-15T00:00:00.000Z" }),
    ]);

    const latest = (await vault.getAllLatest()).sort((a, b) =>
      a.recordId.localeCompare(b.recordId),
    );

    expect(latest.map((r) => [r.recordId, r.version, r.firstCreatedAt])).toEqual([
      ["r1", 2, "2026-10-01T00:00:00.000Z"],
      ["r2", 1, "2026-09-15T00:00:00.000Z"],
    ]);
    expect(latest.find((r) => r.recordId === "r1")).toMatchObject({
      encryptedData: "data-r1-2",
      deleted_at: null,
    });
  });

  it("getAllLatest narrows to one vault when given its id", async () => {
    await vault.upsertRecords([
      record("r1", 1),
      record("r2", 1, { vaultId: "v-work" }),
      record("r2", 2, { vaultId: "v-work" }),
    ]);

    expect((await vault.getAllLatest("v-work")).map((r) => [r.recordId, r.version])).toEqual([
      ["r2", 2],
    ]);
    expect(await vault.getAllLatest("v-other")).toEqual([]);
    expect(await vault.getAllLatest()).toHaveLength(2);
  });

  it("getAllLatest hides records whose latest version is a tombstone", async () => {
    await vault.upsertRecords([
      record("r1", 1),
      record("r1", 2, { deleted_at: "2026-10-02T00:00:00.000Z" }),
    ]);

    expect(await vault.getAllLatest()).toEqual([]);
  });

  it("re-upserting a (recordId, version) replaces the stored row", async () => {
    await vault.upsertRecords([record("r1", 1)]);
    await vault.upsertRecords([record("r1", 1, { encryptedData: "changed" })]);

    const [only, ...rest] = await vault.getAllLatest();
    expect(rest).toEqual([]);
    expect(only?.encryptedData).toBe("changed");
  });

  it("upserts inputs larger than one statement chunk", async () => {
    const many = Array.from({ length: 1201 }, (_, i) => record(`r${i}`, 1));

    await vault.upsertRecords(many);

    expect(await vault.getAllLatest()).toHaveLength(1201);
  });

  it("an upsert that fails part-way writes nothing", async () => {
    const many = Array.from({ length: 600 }, (_, i) => record(`r${i}`, 1));
    // Second chunk violates NOT NULL.
    many[550] = record("bad", 1, { encryptedData: null as unknown as string });

    await expect(vault.upsertRecords(many)).rejects.toThrow();

    expect(await vault.getAllLatest()).toEqual([]);
  });

  it("getByRecordId returns the latest version, even a tombstone", async () => {
    await vault.upsertRecords([
      record("r1", 1),
      record("r1", 2, { deleted_at: "2026-10-02T00:00:00.000Z" }),
      // Earlier than any r1 version: must not leak into r1's firstCreatedAt.
      record("r2", 1, { created_at: "2026-09-15T00:00:00.000Z" }),
    ]);

    expect(await vault.getByRecordId("r1")).toMatchObject({
      recordId: "r1",
      version: 2,
      deleted_at: "2026-10-02T00:00:00.000Z",
      firstCreatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(await vault.getByRecordId("missing")).toBeUndefined();
  });
});

describe("key material", () => {
  it("round-trips the account key material, including the Argon2 params, and the vault keys", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal, vaultKey("v-work")]);

    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect((await vault.getVaults()).sort((a, b) => a.vaultId.localeCompare(b.vaultId))).toEqual([
      personal,
      vaultKey("v-work"),
    ]);
  });

  it("returns null until the account key material is complete", async () => {
    expect(await vault.getAccountKeyMaterial()).toBeNull();

    await vault.setBiometricKeyMaterial(biometricKey);

    expect(await vault.getAccountKeyMaterial()).toBeNull();
  });

  it.each([
    ["isn't JSON", "{not json"],
    ["fails the schema", JSON.stringify({ keyVersion: 1, publicKey: "short" })],
  ])("treats a cached keypair that %s as no key material", async (_label, stored) => {
    await vault.setAccountKeyMaterial(
      { ...accountKey, userKeyPair: stored as unknown as AccountKeyMaterial["userKeyPair"] },
      [personal],
    );

    expect(await vault.getAccountKeyMaterial()).toBeNull();
  });

  it("a second set overwrites the account key and replaces the vault key list", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal, vaultKey("v-left")]);
    await vault.setAccountKeyMaterial({ ...accountKey, encryptedAccountKey: "rekeyed" }, [
      personal,
    ]);

    expect(await vault.getAccountKeyMaterial()).toEqual({
      ...accountKey,
      encryptedAccountKey: "rekeyed",
    });
    expect(await vault.getVaults()).toEqual([personal]);
  });

  it("writes nothing when the vault key list is invalid", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);

    // Duplicate vaultId violates the primary key, after the account key was upserted.
    await expect(
      vault.setAccountKeyMaterial({ ...accountKey, encryptedAccountKey: "half" }, [
        personal,
        personal,
      ]),
    ).rejects.toThrow();

    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect(await vault.getVaults()).toEqual([personal]);
  });

  it("clears biometric material without touching the account key", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.setBiometricKeyMaterial(biometricKey);
    expect(await vault.getBiometricKeyMaterial()).toEqual(biometricKey);

    await vault.clearBiometricKeyMaterial();

    expect(await vault.getBiometricKeyMaterial()).toBeNull();
    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
  });
});

describe("profile", () => {
  const linked: LocalProfile = {
    profileId: "p-1",
    mode: "linked",
    email: "a@b.c",
    userId: "u-1",
  };

  it("is null until set, then round-trips with the key material", async () => {
    expect(await vault.getProfile()).toBeNull();

    await vault.setAccountKeyMaterial(accountKey, [personal], linked);

    expect(await vault.getProfile()).toEqual(linked);
    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
  });

  it("round-trips a local profile without email or userId", async () => {
    const local: LocalProfile = { profileId: "p-2", mode: "local", email: null, userId: null };
    await vault.setAccountKeyMaterial(accountKey, [personal], local);

    expect(await vault.getProfile()).toEqual(local);
  });

  it("keeps the profile when the key material is set without one", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal], linked);
    await vault.setAccountKeyMaterial({ ...accountKey, encryptedAccountKey: "rekeyed" }, [
      personal,
    ]);

    expect(await vault.getProfile()).toEqual(linked);
  });

  it("replaces the profile: there is only ever one", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal], linked);
    const other: LocalProfile = { ...linked, profileId: "p-3", userId: "u-2" };
    await vault.setAccountKeyMaterial(accountKey, [personal], other);

    expect(await vault.getProfile()).toEqual(other);
  });

  it("writes no profile when the rest of the write fails", async () => {
    await expect(
      vault.setAccountKeyMaterial(accountKey, [personal, personal], linked),
    ).rejects.toThrow();

    expect(await vault.getProfile()).toBeNull();
  });
});

describe("createLocalVault", () => {
  const local = { profileId: "p-local", mode: "local", email: null, userId: null } as const;
  const recovery: RecoveryKeySchema = {
    recoveryKekSalt: toBase64(new Uint8Array(32).fill(4)),
    encryptedAccountKeyRecovery: toBase64(new Uint8Array(48).fill(5)),
    accountKeyEncryptionNonceRecovery: toBase64(new Uint8Array(24).fill(6)),
    recoveryVerifier: toBase64(new Uint8Array(32).fill(7)),
  };

  it("stores the profile, both account key wraps and the personal vault", async () => {
    await vault.createLocalVault(accountKey, recovery, [personal], local);

    expect(await vault.getProfile()).toEqual(local);
    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect(await vault.getRecoveryKeyMaterial()).toEqual(recovery);
    expect(await vault.getVaults()).toEqual([personal]);
  });

  it("never replaces a vault already on the device", async () => {
    const linked: LocalProfile = { profileId: "p-1", mode: "linked", email: "a@b.c", userId: "u" };
    await vault.setAccountKeyMaterial(accountKey, [personal], linked);

    await expect(
      vault.createLocalVault(
        { ...accountKey, encryptedAccountKey: "other" },
        recovery,
        [vaultKey("v-new", "personal")],
        local,
      ),
    ).rejects.toThrow(/already holds a vault/);

    expect(await vault.getProfile()).toEqual(linked);
    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect(await vault.getRecoveryKeyMaterial()).toBeNull();
    expect(await vault.getVaults()).toEqual([personal]);
  });

  it("counts leftovers as a vault: records, or a malformed profile row", async () => {
    await vault.upsertRecords([record("r1", 1)]);
    await expect(vault.createLocalVault(accountKey, recovery, [personal], local)).rejects.toThrow(
      VaultExistsError,
    );

    const driver = createTestDriver();
    const other = new Vault(driver);
    try {
      await other.getProfile(); // migrated
      // A linked row without email reads as no profile, but it is still there.
      await driver.query(
        "INSERT INTO profile (profileId, mode, email, userId) VALUES ('p', 'linked', NULL, NULL)",
        [],
        "run",
      );
      expect(await other.getProfile()).toBeNull();
      await expect(other.createLocalVault(accountKey, recovery, [personal], local)).rejects.toThrow(
        VaultExistsError,
      );
    } finally {
      await other.destroy();
    }
  });

  it("ignores a leftover biometric enrollment: it opens nothing on its own", async () => {
    await vault.setBiometricKeyMaterial(biometricKey);

    await vault.createLocalVault(accountKey, recovery, [personal], local);

    expect(await vault.getProfile()).toEqual(local);
  });

  it("refuses malformed recovery material without writing anything", async () => {
    await expect(
      vault.createLocalVault(accountKey, { ...recovery, recoveryVerifier: "x" }, [personal], local),
    ).rejects.toThrow();

    expect(await vault.getProfile()).toBeNull();
    expect(await vault.getAccountKeyMaterial()).toBeNull();
  });

  it("linking keeps the data and drops the recovery wrap (the server holds it)", async () => {
    await vault.createLocalVault(accountKey, recovery, [personal], local);
    await vault.writeLocalChanges([
      {
        kind: "create",
        recordId: "r1",
        vaultId: personal.vaultId,
        encryptedData: "data",
        encryptionNonce: "nonce",
        cryptoVersion: 1,
        keyVersion: 1,
        clientUpdatedAt: "2026-10-08T00:00:00.000Z",
      },
    ]);
    const linked: LocalProfile = { ...local, mode: "linked", email: "a@b.c", userId: "u-1" };

    await vault.setAccountKeyMaterial(accountKey, [personal], linked);

    expect(await vault.getProfile()).toEqual(linked);
    expect(await vault.getRecoveryKeyMaterial()).toBeNull();
    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    // Still queued: the first sync uploads it.
    expect(await vault.countPendingChanges()).toBe(1);
  });

  it("replaces both account key wraps of a local vault at once (local recovery)", async () => {
    await vault.createLocalVault(accountKey, recovery, [personal], local);
    const nextMaterial = {
      ...accountKey,
      encryptedAccountKey: toBase64(new Uint8Array(48).fill(8)),
    };
    const nextRecovery = { ...recovery, recoveryVerifier: toBase64(new Uint8Array(32).fill(9)) };

    await vault.setLocalKeyMaterial(nextMaterial, nextRecovery);

    expect(await vault.getAccountKeyMaterial()).toEqual(nextMaterial);
    expect(await vault.getRecoveryKeyMaterial()).toEqual(nextRecovery);
    expect(await vault.getVaults()).toEqual([personal]);
  });

  it("never replaces a linked vault's key wraps locally", async () => {
    const linked: LocalProfile = { profileId: "p-1", mode: "linked", email: "a@b.c", userId: "u" };
    await vault.setAccountKeyMaterial(accountKey, [personal], linked);

    await expect(
      vault.setLocalKeyMaterial({ ...accountKey, encryptedAccountKey: "other" }, recovery),
    ).rejects.toThrow(/Not a local vault/);

    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect(await vault.getRecoveryKeyMaterial()).toBeNull();
  });

  it("writes neither wrap when one is malformed", async () => {
    await vault.createLocalVault(accountKey, recovery, [personal], local);
    const nextMaterial = {
      ...accountKey,
      encryptedAccountKey: toBase64(new Uint8Array(48).fill(8)),
    };

    await expect(
      vault.setLocalKeyMaterial(nextMaterial, { ...recovery, recoveryVerifier: "x" }),
    ).rejects.toThrow();

    expect(await vault.getAccountKeyMaterial()).toEqual(accountKey);
    expect(await vault.getRecoveryKeyMaterial()).toEqual(recovery);
  });

  it("is gone after clear()", async () => {
    await vault.createLocalVault(accountKey, recovery, [personal], local);
    await vault.clear();

    expect(await vault.getRecoveryKeyMaterial()).toBeNull();
    expect(await vault.getProfile()).toBeNull();
  });
});

describe("applySync", () => {
  const work = vaultKey("v-work");
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";

  it("stores records, the vault list and one cursor per vault", async () => {
    const changed = await vault.applySync({
      records: [record("r1", 1), record("r2", 1, { vaultId: "v-work" })],
      vaults: [personal, work],
      cursors: { "v-personal": 4, "v-work": 1 },
      serverTimestamp: T1,
    });

    expect(changed).toBe(true);
    expect((await vault.getAllLatest()).map((r) => r.recordId).sort()).toEqual(["r1", "r2"]);
    expect(await vault.getSyncCursors()).toEqual({ "v-personal": 4, "v-work": 1 });
  });

  it("reports an unchanged vault list and advances the cursors", async () => {
    await vault.applySync({
      records: [],
      vaults: [personal, work],
      cursors: { "v-personal": 1, "v-work": 1 },
      serverTimestamp: T1,
    });

    const changed = await vault.applySync({
      records: [],
      vaults: [work, personal],
      cursors: { "v-personal": 7, "v-work": 1 },
      serverTimestamp: T2,
    });

    expect(changed).toBe(false);
    expect(await vault.getSyncCursors()).toEqual({ "v-personal": 7, "v-work": 1 });
  });

  it("reports a renamed (re-encrypted metadata) vault as a change", async () => {
    await vault.applySync({
      records: [],
      vaults: [personal, work],
      cursors: {},
      serverTimestamp: T1,
    });

    const renamed = { ...work, encryptedMeta: "renamed" };
    expect(
      await vault.applySync({
        records: [],
        vaults: [personal, renamed],
        cursors: {},
        serverTimestamp: T2,
      }),
    ).toBe(true);
    expect(await vault.getVaults()).toContainEqual(renamed);
  });

  it("drops a vault the user lost, with its records and cursor", async () => {
    await vault.applySync({
      records: [record("r1", 1), record("r2", 1, { vaultId: "v-work" })],
      vaults: [personal, work],
      cursors: { "v-personal": 1, "v-work": 1 },
      serverTimestamp: T1,
    });

    await vault.applySync({
      records: [],
      vaults: [personal],
      cursors: { "v-personal": 2 },
      serverTimestamp: T2,
    });

    expect((await vault.getAllLatest()).map((r) => r.recordId)).toEqual(["r1"]);
    expect(await vault.getVaults()).toEqual([personal]);
    expect(await vault.getSyncCursors()).toEqual({ "v-personal": 2 });
  });

  it("ignores records and cursors of vaults outside the list", async () => {
    await vault.applySync({
      records: [record("r1", 1), record("r2", 1, { vaultId: "v-gone" })],
      vaults: [personal],
      cursors: { "v-personal": 1, "v-gone": 1 },
      serverTimestamp: T1,
    });

    expect((await vault.getAllLatest()).map((r) => r.recordId)).toEqual(["r1"]);
    expect(await vault.getSyncCursors()).toEqual({ "v-personal": 1 });
  });

  it("skips a stored cursor that isn't a seq and drops legacy timestamp cursors", async () => {
    const driver = createTestDriver();
    const store = new Vault(driver);
    await store.getSyncCursors(); // migrated
    const put = (key: string, value: string) =>
      driver.query("INSERT INTO sync_meta (key, value) VALUES (?, ?)", [key, value], "run");
    await put("pullSeq:v-personal", "3");
    await put("pullSeq:v-work", "garbage");
    await put("lastSyncedAt:v-personal", T1);

    // The broken cursor isn't sent; that vault is pulled in full.
    expect(await store.getSyncCursors()).toEqual({ "v-personal": 3 });

    await store.applySync({
      records: [],
      vaults: [personal, work],
      cursors: { "v-personal": 3, "v-work": 2 },
      serverTimestamp: T2,
    });
    expect(await store.getSyncCursors()).toEqual({ "v-personal": 3, "v-work": 2 });
    const legacy = await driver.query(
      "SELECT key FROM sync_meta WHERE key LIKE 'lastSyncedAt:%'",
      [],
      "all",
    );
    expect(legacy.rows).toEqual([]);
    await store.destroy();
  });
});

describe("clear", () => {
  it("removes records, profile, key material, vault keys and sync state", async () => {
    await vault.upsertRecords([record("r1", 1)]);
    await vault.setAccountKeyMaterial(accountKey, [personal], {
      profileId: "p-1",
      mode: "linked",
      email: "a@b.c",
      userId: "u-1",
    });
    await vault.setBiometricKeyMaterial(biometricKey);
    await vault.applySync({
      records: [],
      vaults: [personal],
      cursors: {},
      serverTimestamp: "2026-10-01T00:00:00.000Z",
    });

    await vault.clear();

    expect(await vault.getAllLatest()).toEqual([]);
    expect(await vault.getProfile()).toBeNull();
    expect(await vault.getAccountKeyMaterial()).toBeNull();
    expect(await vault.getVaults()).toEqual([]);
    expect(await vault.getBiometricKeyMaterial()).toBeNull();
    expect(await vault.getSyncCursors()).toEqual({});
  });
});

describe("vaults on the device", () => {
  const work = vaultKey("v-work");

  function create(recordId: string, vaultId: string) {
    return {
      kind: "create" as const,
      recordId,
      vaultId,
      encryptedData: "data",
      encryptionNonce: "nonce",
      cryptoVersion: 1,
      keyVersion: 1,
      clientUpdatedAt: "2026-10-08T00:00:00.000Z",
    };
  }

  it("adds a vault next to the others and replaces its row on a second save", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.saveVault(work);
    await vault.saveVault({ ...work, role: "read" });

    expect(await vault.getVaults()).toEqual([personal, { ...work, role: "read" }]);
  });

  it("replaces a vault's metadata, and throws for a vault that isn't here", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal, work]);
    await vault.setVaultMeta(work.vaultId, { encryptedMeta: "m2", metaEncryptionNonce: "n2" });

    const [, saved] = await vault.getVaults();
    expect(saved).toMatchObject({ encryptedMeta: "m2", metaEncryptionNonce: "n2" });
    await expect(
      vault.setVaultMeta("v-none", { encryptedMeta: "m", metaEncryptionNonce: "n" }),
    ).rejects.toThrow();
  });

  it("removes a vault with its records, unsent changes and cursor, and nothing else", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal, work]);
    await vault.writeLocalChanges([create("r-work", work.vaultId), create("r-mine", "v-personal")]);
    await vault.applySync({
      records: [],
      vaults: [personal, work],
      cursors: { [work.vaultId]: 3, "v-personal": 2 },
      serverTimestamp: "2026-10-08T00:00:00.000Z",
    });

    await vault.removeVault(work.vaultId);

    expect(await vault.getVaults()).toEqual([personal]);
    expect((await vault.getAllLatest()).map((r) => r.recordId)).toEqual(["r-mine"]);
    expect((await vault.getPendingChanges()).map((c) => c.record.recordId)).toEqual(["r-mine"]);
    expect(await vault.getSyncCursors()).toEqual({ "v-personal": 2 });
  });

  it("never removes the personal vault", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await expect(vault.removeVault(personal.vaultId)).rejects.toThrow();
    expect(await vault.getVaults()).toEqual([personal]);
  });
});

describe("vault key rotation", () => {
  const link = {
    keyVersion: 1,
    encryptedVaultKey: "prev-enc",
    vaultKeyEncryptionNonce: "prev-nonce",
  };
  const rotated: MemberVault = {
    ...personal,
    keyVersion: 2,
    encryptedVaultKey: "enc-2",
    previousKeys: [link],
  };

  function put(recordId: string, keyVersion: number, kind: "create" | "update" = "create") {
    return {
      kind,
      recordId,
      vaultId: personal.vaultId,
      encryptedData: `data-${keyVersion}`,
      encryptionNonce: "nonce",
      cryptoVersion: 1,
      keyVersion,
      clientUpdatedAt: "2026-10-10T00:00:00.000Z",
    };
  }

  it("keeps a vault's earlier keys with it, and tells a changed chain apart", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.saveVault(rotated);

    expect(await vault.getVaults()).toEqual([rotated]);
    expect(sameVaults([rotated], [{ ...rotated, previousKeys: [{ ...link }] }])).toBe(true);
    expect(sameVaults([rotated], [{ ...rotated, previousKeys: [] }])).toBe(false);
  });

  it("finds pending content under an old key and swaps in its re-encryption", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.writeLocalChanges([put("r1", 1), put("r2", 1)]);
    await vault.writeLocalChanges([
      { kind: "delete", recordId: "r2", clientUpdatedAt: "2026-10-10T00:00:00.000Z" },
    ]);
    expect(await vault.getPendingUnderOldKeys()).toEqual([]);

    await vault.saveVault(rotated);
    const stale = await vault.getPendingUnderOldKeys();
    // A tombstone sends no ciphertext: it stays as it is.
    expect(stale.map((r) => [r.recordId, r.version])).toEqual([
      ["r1", 1],
      ["r2", 1],
    ]);

    await vault.replacePendingCiphertexts([
      {
        recordId: "r1",
        version: 1,
        fromKeyVersion: 1,
        encryptedData: "new",
        encryptionNonce: "n2",
        cryptoVersion: 1,
        keyVersion: 2,
      },
      // Changed meanwhile (not under key 1 any more): left alone.
      {
        recordId: "r2",
        version: 1,
        fromKeyVersion: 2,
        encryptedData: "x",
        encryptionNonce: "x",
        cryptoVersion: 1,
        keyVersion: 2,
      },
    ]);

    expect(await vault.getByRecordId("r1")).toMatchObject({ encryptedData: "new", keyVersion: 2 });
    expect((await vault.getPendingUnderOldKeys()).map((r) => r.recordId)).toEqual(["r2"]);
  });

  it("never swaps the ciphertext of a version the server has", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    const [row] = await vault.writeLocalChanges([put("r1", 1)]);
    const [change] = await vault.getPendingChanges();
    await vault.ackPendingChange(change!.changeId, null);

    await vault.replacePendingCiphertexts([
      {
        recordId: "r1",
        version: 1,
        fromKeyVersion: 1,
        encryptedData: "new",
        encryptionNonce: "n",
        cryptoVersion: 1,
        keyVersion: 2,
      },
    ]);

    expect(await vault.getByRecordId("r1")).toMatchObject({
      encryptedData: row!.encryptedData,
      keyVersion: 1,
    });
  });

  it("writes a re-encrypted version only on top of the head it was read from", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.writeLocalChanges([put("r1", 1), put("r2", 1), put("r3", 1)]);
    await vault.writeLocalChanges([put("r2", 2, "update")]); // edited meanwhile
    await vault.writeLocalChanges([
      { kind: "delete", recordId: "r3", clientUpdatedAt: "2026-10-10T00:00:00.000Z" },
    ]);

    const rekeyed = (recordId: string) => {
      const { kind: _kind, ...ciphertext } = put(recordId, 2);
      return { ...ciphertext, encryptedData: `rekeyed-${recordId}`, headVersion: 1 };
    };
    const written = await vault.writeReencryptedVersions(["r1", "r2", "r3"].map(rekeyed));

    expect(written).toBe(1);
    expect(await vault.getByRecordId("r1")).toMatchObject({
      version: 2,
      encryptedData: "rekeyed-r1",
      keyVersion: 2,
    });
    expect(await vault.getByRecordId("r2")).toMatchObject({ version: 2, encryptedData: "data-2" });
    expect(await vault.getByRecordId("r3")).toMatchObject({
      version: 2,
      deleted_at: expect.any(String),
    });
  });

  it("remembers a started rotation until cleared, or its vault is dropped", async () => {
    await vault.setAccountKeyMaterial(accountKey, [personal, vaultKey("v-work")]);
    await vault.setRekeyTarget("v-personal", 2);
    await vault.setRekeyTarget("v-work", 3);

    // A later rotation started meanwhile stays.
    await vault.clearRekeyTarget("v-personal", 1);
    expect(await vault.getRekeyTargets()).toEqual({ "v-personal": 2, "v-work": 3 });

    await vault.clearRekeyTarget("v-personal", 2);
    await vault.removeVault("v-work");
    expect(await vault.getRekeyTargets()).toEqual({});
  });
});
