import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, EncryptedRecordSchema, MemberVaultKey } from "@repo/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vault } from "../src/vault";
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
    version,
    encryptedData: `data-${recordId}-${version}`,
    encryptionNonce: `nonce-${recordId}-${version}`,
    cryptoVersion: 1,
    clientUpdatedAt: `2026-10-0${version}T00:00:00.000Z`,
    created_at: `2026-10-0${version}T00:00:00.000Z`,
    updated_at: `2026-10-0${version}T00:00:00.000Z`,
    deleted_at: null,
    ...overrides,
  };
}

const accountKey: AccountKeyMaterial = {
  email: "a@b.c",
  passwordKekParams: { t: 3, m: 65536, p: 4 },
  passwordKekSalt: "salt",
  encryptedAccountKey: "enc",
  accountKeyEncryptionNonce: "nonce",
};

function vaultKey(vaultId: string, kind: MemberVaultKey["kind"] = "shared"): MemberVaultKey {
  return {
    vaultId,
    kind,
    keyVersion: 1,
    encryptedVaultKey: `enc-${vaultId}`,
    vaultKeyEncryptionNonce: `nonce-${vaultId}`,
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
    expect((await vault.getVaultKeys()).sort((a, b) => a.vaultId.localeCompare(b.vaultId))).toEqual(
      [personal, vaultKey("v-work")],
    );
  });

  it("returns null until the account key material is complete", async () => {
    expect(await vault.getAccountKeyMaterial()).toBeNull();

    await vault.setBiometricKeyMaterial(biometricKey);

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
    expect(await vault.getVaultKeys()).toEqual([personal]);
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
    expect(await vault.getVaultKeys()).toEqual([personal]);
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

describe("sync meta", () => {
  it("stores and overwrites the last sync timestamp", async () => {
    expect(await vault.getLastSyncTimestamp()).toBeNull();

    await vault.setLastSyncTimestamp("2026-10-01T00:00:00.000Z");
    await vault.setLastSyncTimestamp("2026-10-02T00:00:00.000Z");

    expect(await vault.getLastSyncTimestamp()).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("clear", () => {
  it("removes records, key material, vault keys and sync state", async () => {
    await vault.upsertRecords([record("r1", 1)]);
    await vault.setAccountKeyMaterial(accountKey, [personal]);
    await vault.setBiometricKeyMaterial(biometricKey);
    await vault.setLastSyncTimestamp("2026-10-01T00:00:00.000Z");

    await vault.clear();

    expect(await vault.getAllLatest()).toEqual([]);
    expect(await vault.getAccountKeyMaterial()).toBeNull();
    expect(await vault.getVaultKeys()).toEqual([]);
    expect(await vault.getBiometricKeyMaterial()).toBeNull();
    expect(await vault.getLastSyncTimestamp()).toBeNull();
  });
});
