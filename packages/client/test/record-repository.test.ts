import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type { MemberVault, RecordData } from "@repo/schema";
import { secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { RecordRepository } from "../src/records/record-repository";
import { decryptRecord } from "../src/util/decrypt-record";

const login = (title: string) => ({ type: "login", title }) as RecordData;

let vault: Vault;
let repository: RecordRepository;
let onWrite: ReturnType<typeof vi.fn<() => void>>;
let personalId: string;
let workId: string;

const previousParams = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  const { accountKey, vaults } = await generateLocalVault("pw");
  secretsStore.unlockWithAccountKey(accountKey);
  const work = secretsStore.createVault({ name: "Work" });
  const workVault: MemberVault = { ...work, kind: "shared", role: "owner" };
  secretsStore.loadVaultKeys([...vaults, workVault]);
  personalId = vaults[0]!.vaultId;
  workId = work.vaultId;
});
afterAll(() => {
  secretsStore.lock();
  setPasswordKekParams(previousParams);
});

beforeEach(() => {
  vault = new Vault(createTestDriver());
  onWrite = vi.fn<() => void>();
  repository = new RecordRepository(vault, onWrite);
});
afterEach(async () => {
  await vault.destroy();
});

const titleOf = (row: Parameters<typeof decryptRecord>[0]) =>
  (decryptRecord(row) as { title: string }).title;

describe("RecordRepository", () => {
  it("creates a record in the personal vault, readable locally and queued for the server", async () => {
    const created = await repository.create(login("GitHub"));

    expect(created).toMatchObject({ vaultId: personalId, version: 1 });
    expect(titleOf((await repository.getById(created.recordId))!)).toBe("GitHub");
    expect((await repository.getAll()).map((r) => r.recordId)).toEqual([created.recordId]);
    expect(await vault.countPendingChanges()).toBe(1);
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it("keeps every version in the local history, newest first", async () => {
    const created = await repository.create(login("v1"));
    await repository.update(created, login("v2"));
    await repository.delete(created.recordId);

    const history = await repository.history(created.recordId);
    expect(history.map((r) => [r.version, titleOf(r), r.deleted_at !== null])).toEqual([
      [3, "v2", true],
      [2, "v2", false],
      [1, "v1", false],
    ]);
    expect(await repository.getAll()).toEqual([]);
    expect(await vault.countPendingChanges()).toBe(3);
  });

  it("moves a record: re-encrypted as a new record in the target, source tombstoned", async () => {
    const source = await repository.create(login("Moving"));

    const moved = await repository.move(source, login("Moving"), workId);

    expect(moved.recordId).not.toBe(source.recordId);
    expect(titleOf(moved)).toBe("Moving");
    expect((await repository.getAll(workId)).map((r) => r.recordId)).toEqual([moved.recordId]);
    expect(await repository.getAll(personalId)).toEqual([]);
    expect((await repository.getById(source.recordId))?.deleted_at).not.toBeNull();
  });

  it("writes nothing (and doesn't schedule a sync) when a change doesn't fit", async () => {
    await expect(repository.delete(crypto.randomUUID())).rejects.toThrow();

    expect(await vault.countPendingChanges()).toBe(0);
    expect(onWrite).not.toHaveBeenCalled();
  });
});
