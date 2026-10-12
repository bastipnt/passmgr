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
let personalVault: MemberVault;
let workId: string;

const previousParams = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  const { accountKey, vaults } = await generateLocalVault("pw");
  secretsStore.unlockWithAccountKey(accountKey);
  const work = secretsStore.createVault({ name: "Work" });
  const workVault: MemberVault = { ...work, kind: "shared", role: "owner" };
  secretsStore.loadVaultKeys([...vaults, workVault]);
  personalVault = vaults[0]!;
  personalId = personalVault.vaultId;
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
    // Gone from here, but not to the trash: it lives on in the target.
    expect(await repository.getDeleted()).toEqual([]);
  });

  it("puts a deleted record in the trash, restores it and purges it", async () => {
    // A purge checks the vault is writable.
    await vault.saveVault(personalVault);
    const created = await repository.create(login("Trashed"));
    await repository.delete(created.recordId);

    const [trashed] = await repository.getDeleted();
    expect(trashed).toMatchObject({ recordId: created.recordId });
    expect(titleOf(trashed!)).toBe("Trashed");

    await repository.restore(created, login("Trashed"));
    expect(await repository.getDeleted()).toEqual([]);
    expect((await repository.getAll()).map((r) => r.recordId)).toEqual([created.recordId]);

    await repository.delete(created.recordId);
    onWrite.mockClear();
    await repository.purge([created.recordId]);
    // Never pushed: nothing is left to tell the server.
    expect(await repository.getById(created.recordId)).toBeUndefined();
    expect(await vault.countPendingChanges()).toBe(0);
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it("writes nothing (and doesn't schedule a sync) when a change doesn't fit", async () => {
    await expect(repository.delete(crypto.randomUUID())).rejects.toThrow();

    expect(await vault.countPendingChanges()).toBe(0);
    expect(onWrite).not.toHaveBeenCalled();
  });

  describe("passwordChangedAt", () => {
    const withPassword = (password: string, extra: object = {}) =>
      ({ type: "login", title: "GitHub", password, ...extra }) as RecordData;
    const changedAt = (row: Parameters<typeof decryptRecord>[0]) =>
      (decryptRecord(row) as { passwordChangedAt?: string }).passwordChangedAt;

    afterEach(() => {
      vi.useRealTimers();
    });

    function setNow(iso: string) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(iso));
    }

    it("is set on create and kept until the password changes", async () => {
      setNow("2026-01-01T00:00:00.000Z");
      const created = await repository.create(withPassword("one"));
      setNow("2026-02-01T00:00:00.000Z");
      // A form never sends the date: it comes from the current version.
      const renamed = await repository.update(created, withPassword("one", { note: "x" }));
      setNow("2026-03-01T00:00:00.000Z");
      const changed = await repository.update(created, withPassword("two"));

      expect(changedAt(created)).toBe("2026-01-01T00:00:00.000Z");
      expect(changedAt(renamed)).toBe("2026-01-01T00:00:00.000Z");
      expect(changedAt(changed)).toBe("2026-03-01T00:00:00.000Z");
    });

    it("is absent without a password and on types without one", async () => {
      const created = await repository.create(withPassword("one"));
      const cleared = await repository.update(created, withPassword(""));
      const note = await repository.create({ type: "note", title: "N" } as RecordData);

      expect(changedAt(cleared)).toBeUndefined();
      expect(changedAt(note)).toBeUndefined();
    });

    it("keeps the stored date when older content with the same password is saved", async () => {
      setNow("2026-01-01T00:00:00.000Z");
      const created = await repository.create(withPassword("one"));
      setNow("2026-02-01T00:00:00.000Z");
      await repository.update(created, withPassword("two"));
      setNow("2026-03-01T00:00:00.000Z");
      await repository.update(created, withPassword("one"));

      const saved = await repository.update(created, decryptRecord(created));

      expect(changedAt(saved)).toBe("2026-03-01T00:00:00.000Z");
    });

    it("survives a move and a restore from the trash", async () => {
      setNow("2026-01-01T00:00:00.000Z");
      const created = await repository.create(withPassword("one"));
      const data = decryptRecord(created);
      setNow("2026-05-01T00:00:00.000Z");
      const moved = await repository.move(created, data, workId);
      await repository.delete(moved.recordId);
      const restored = await repository.restore(moved, decryptRecord(moved));

      expect(changedAt(moved)).toBe("2026-01-01T00:00:00.000Z");
      expect(changedAt(restored)).toBe("2026-01-01T00:00:00.000Z");
    });
  });
});
