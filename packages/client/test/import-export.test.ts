import { getPasswordKekParams, retrievePRK, setPasswordKekParams } from "@repo/crypto";
import type { ExportData, MemberVault, RecordData } from "@repo/schema";
import { secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { collectExportData } from "../src/export/collect-export";
import {
  encryptExport,
  exportToJson,
  InvalidExportFileError,
  openExportEnvelope,
  readExportFile,
  WrongExportPasswordError,
} from "../src/export/export-file";
import {
  defaultVaultMap,
  IMPORT_BATCH_SIZE,
  type ImportOptions,
  importExportData,
  planImport,
} from "../src/export/import-export";
import { RecordRepository } from "../src/records/record-repository";
import { decryptRecord } from "../src/util/decrypt-record";

// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", () => ({
  argon2WorkerService: { derive: retrievePRK },
}));

const BACKUP_PASSWORD = "a backup password";
const login = (title: string, password = "secret") =>
  ({ type: "login", title, password }) as RecordData;

let personalId: string;
let workId: string;
let vaults: MemberVault[];

const previousParams = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  const local = await generateLocalVault("pw");
  secretsStore.unlockWithAccountKey(local.accountKey);
  const work = secretsStore.createVault({ name: "Work" });
  vaults = [...local.vaults, { ...work, kind: "shared", role: "owner" }];
  secretsStore.loadVaultKeys(vaults);
  personalId = local.vaults[0]!.vaultId;
  workId = work.vaultId;
});
afterAll(() => {
  secretsStore.lock();
  setPasswordKekParams(previousParams);
});

let vault: Vault;
let repository: RecordRepository;

beforeEach(() => {
  vault = new Vault(createTestDriver());
  repository = new RecordRepository(vault);
  vi.spyOn(vault, "getVaults").mockResolvedValue(vaults);
});
afterEach(async () => {
  await vault.destroy();
});

const options = (extra: Partial<ImportOptions> = {}): ImportOptions => ({
  vaultMap: { [personalId]: personalId, [workId]: workId },
  fallbackVaultId: personalId,
  duplicates: "skip",
  ...extra,
});

/** Title (and password) of every live record per vault, decrypted. */
async function contents(vaultId: string) {
  const rows = (await repository.getAll(vaultId)).filter((r) => !r.deleted_at);
  return rows
    .map((row) => {
      const data = decryptRecord(row) as { title: string; password?: string };
      return `${data.title}:${data.password ?? ""}`;
    })
    .sort();
}

/** `importExportData` with the decryption on the main thread (no workers here). */
function runImport(data: ExportData, opts: ImportOptions) {
  return importExportData(repository, data, opts, async (row) => decryptRecord(row));
}

async function exported(): Promise<ExportData> {
  return (await collectExportData(vault, async (row) => decryptRecord(row))).data;
}

describe("readExportFile", () => {
  it("tells an encrypted backup from plain JSON, and opens the backup", async () => {
    await repository.create(login("Mail"));
    const data = await exported();

    expect(readExportFile(exportToJson(data))).toEqual({ encrypted: false, data });

    const sealed = readExportFile(await encryptExport(data, BACKUP_PASSWORD));
    if (!sealed.encrypted) throw new Error("expected an encrypted file");
    expect(await openExportEnvelope(sealed.envelope, BACKUP_PASSWORD)).toEqual(data);
    await expect(openExportEnvelope(sealed.envelope, "not it")).rejects.toBeInstanceOf(
      WrongExportPasswordError,
    );
  });

  it.each(["not json", "{}", JSON.stringify({ format: "other", version: 1 })])(
    "refuses %s",
    (file) => {
      expect(() => readExportFile(file)).toThrow(InvalidExportFileError);
    },
  );
});

describe("importExportData", () => {
  it("round-trips an export into an empty vault, keeping ids and vaults", async () => {
    const mail = await repository.create(login("Mail"));
    await repository.create(login("VPN"), workId);
    const data = await exported();
    await vault.destroy();
    vault = new Vault(createTestDriver());
    repository = new RecordRepository(vault);

    const result = await runImport(data, options());

    expect(result).toEqual({ created: 2, updated: 0, skipped: 0 });
    expect(await contents(personalId)).toEqual(["Mail:secret"]);
    expect(await contents(workId)).toEqual(["VPN:secret"]);
    expect(await repository.getById(mail.recordId)).toMatchObject({ vaultId: personalId });
    // Local versions with outbox entries: a linked profile pushes them.
    expect(await vault.countPendingChanges()).toBe(2);
  });

  it("re-encrypts a record mapped to another vault as a new record", async () => {
    const mail = await repository.create(login("Mail"));
    const data = await exported();

    await runImport(data, options({ vaultMap: { [personalId]: workId } }));

    const [moved] = await repository.getAll(workId);
    expect(moved!.recordId).not.toBe(mail.recordId);
    expect(await contents(workId)).toEqual(["Mail:secret"]);
    expect(await contents(personalId)).toEqual(["Mail:secret"]);
  });

  it.each([
    ["skip", ["Mail:changed"], { created: 0, updated: 0, skipped: 1 }],
    ["overwrite", ["Mail:secret"], { created: 0, updated: 1, skipped: 0 }],
    ["keep-both", ["Mail:changed", "Mail:secret"], { created: 1, updated: 0, skipped: 0 }],
  ] as const)("handles a duplicate id with %s", async (duplicates, expected, result) => {
    const mail = await repository.create(login("Mail"));
    const data = await exported();
    await repository.update(mail, login("Mail", "changed"));

    expect(await runImport(data, options({ duplicates }))).toEqual(result);

    expect(await contents(personalId)).toEqual(expected);
    if (duplicates === "overwrite") {
      // The overwritten content stays in the history.
      expect((await repository.history(mail.recordId)).map((r) => r.version)).toEqual([3, 2, 1]);
    }
  });

  it.each([
    ["skip", { version: 2, deleted: true }],
    ["overwrite", { version: 3, deleted: false }],
  ] as const)("with %s, a deleted record %s", async (duplicates, expected) => {
    const mail = await repository.create(login("Mail"));
    const data = await exported();
    await repository.delete(mail.recordId);

    await runImport(data, options({ duplicates }));

    const head = (await repository.getById(mail.recordId))!;
    expect({ version: head.version, deleted: head.deleted_at !== null }).toEqual(expected);
  });

  it("writes nothing when an overwrite holds the same content", async () => {
    const mail = await repository.create(login("Mail"));
    const data = await exported();

    expect(await runImport(data, options({ duplicates: "overwrite" }))).toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
    });
    expect((await repository.history(mail.recordId)).map((r) => r.version)).toEqual([1]);
  });

  it("writes large files in batches", async () => {
    const data = await exported();
    const count = IMPORT_BATCH_SIZE * 2 + 1;
    data.records = Array.from({ length: count }, (_, i) => ({
      ...(login(`R${i}`) as Extract<RecordData, { type: "login" }>),
      id: crypto.randomUUID(),
      vaultId: personalId,
      createdAt: null,
      updatedAt: "2026-10-01T00:00:00.000Z",
    }));
    const writeImport = vi.spyOn(repository, "writeImport");

    expect(await runImport(data, options())).toMatchObject({ created: count });
    expect(writeImport).toHaveBeenCalledTimes(3);
  });
});

describe("planImport", () => {
  const record = (id: string, vaultId: string) => ({
    type: "note" as const,
    title: "N",
    id,
    vaultId,
    createdAt: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
  });
  const data = (records: ReturnType<typeof record>[]) =>
    ({ vaults: [], records }) as unknown as ExportData;

  it("gives a new id to a record whose id lives in another vault", () => {
    const id = crypto.randomUUID();
    const plan = planImport(
      data([record(id, personalId)]),
      new Map([[id, { vaultId: workId, deleted: false }]]),
      options(),
    );
    expect(plan.entries).toEqual([
      expect.objectContaining({ kind: "create", vaultId: personalId }),
    ]);
    expect(plan.entries[0]!.recordId).not.toBe(id);
  });

  it("keeps the file's ids in another vault with keepIds", () => {
    const id = crypto.randomUUID();
    const elsewhere = crypto.randomUUID();
    const plain = planImport(data([record(id, elsewhere)]), new Map(), options());
    expect(plain.entries[0]!.recordId).not.toBe(id);

    const plan = planImport(data([record(id, elsewhere)]), new Map(), options({ keepIds: true }));
    expect(plan.entries).toEqual([
      expect.objectContaining({ kind: "create", recordId: id, vaultId: personalId }),
    ]);
  });

  it("treats an id the file holds twice as a duplicate", () => {
    const id = crypto.randomUUID();
    const plan = planImport(
      data([record(id, personalId), record(id, personalId)]),
      new Map(),
      options(),
    );
    expect(plan).toEqual({
      entries: [expect.objectContaining({ kind: "create", recordId: id })],
      skipped: 1,
    });
  });
});

describe("defaultVaultMap", () => {
  it("keeps a writable vault, sends the rest to the fallback", () => {
    const other = crypto.randomUUID();
    const readOnly: MemberVault = { ...vaults[1]!, role: "read" };
    expect(
      defaultVaultMap(
        [
          { id: personalId, name: "Personal", kind: "personal" },
          { id: workId, name: "Work", kind: "shared" },
          { id: other, name: "Gone", kind: "shared" },
        ],
        [vaults[0]!, readOnly],
        personalId,
      ),
    ).toEqual({ [personalId]: personalId, [workId]: personalId, [other]: personalId });
  });
});
