import { decryptExport, useExport } from "@repo/client";
import {
  generateLocalVault,
  type NewLocalVault,
} from "@repo/client/src/account/create-local-vault";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import {
  CURRENT_CRYPTO_VERSION,
  CURRENT_SCHEMA_VERSION,
  type EncryptedRecordSchema,
  exportDataSchema,
  type RecordData,
} from "@repo/schema";
import { secretsStore } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

// Real hook, keyring, record encryption and export; the store is replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
// The real Argon2 derivation and decryption, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK: derive } = await import("@repo/crypto");
  return { argon2WorkerService: { derive } };
});
vi.mock("@repo/client/src/util/decrypt-record", async (importActual) => {
  const actual = await importActual<typeof import("@repo/client/src/util/decrypt-record")>();
  return { ...actual, decryptRecordWithWorker: async (row: never) => actual.decryptRecord(row) };
});

const PASSWORD = "hunter2hunter2";
const BACKUP_PASSWORD = "a separate backup password";

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

let local: NewLocalVault;

function encrypted(data: RecordData, extra: Partial<EncryptedRecordSchema> = {}) {
  const recordId = crypto.randomUUID();
  const vaultId = local.vaults[0]!.vaultId;
  const [encryptedData, encryptionNonce, keyVersion] = secretsStore.encryptRecord(
    { recordId, vaultId },
    JSON.stringify({ ...data, schemaVersion: CURRENT_SCHEMA_VERSION }),
  );
  return {
    recordId,
    vaultId,
    encryptedData,
    encryptionNonce,
    cryptoVersion: CURRENT_CRYPTO_VERSION,
    keyVersion,
    version: 1,
    clientUpdatedAt: "2026-10-02T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  } satisfies EncryptedRecordSchema;
}

let getAllLatest: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  local = await generateLocalVault(PASSWORD);
  store.profiles = [profileEntry(local.profile)];
  store.profile = local.profile;
  store.accountKeyMaterial = local.material;
  store.vault.getVaults.mockResolvedValue(local.vaults);
  secretsStore.unlockWithAccountKey(local.accountKey.slice());
  secretsStore.loadVaultKeys(local.vaults);

  const rows = [
    encrypted({ type: "login", title: "Mail", username: "me", password: "mail-secret" }),
    encrypted({ type: "note", title: "Gone" }, { deleted_at: "2026-10-03T00:00:00.000Z" }),
    // Another vault's ciphertext: doesn't open, left out and counted.
    { ...encrypted({ type: "note", title: "Broken" }), vaultId: crypto.randomUUID() },
  ];
  getAllLatest = vi.fn(async () => rows);
  Object.assign(store.vault, { getAllLatest });
});

afterEach(() => {
  secretsStore.clearPassword();
  secretsStore.lock();
});

describe("useExport", () => {
  it("writes an encrypted backup of the live records, a backup once saved", async () => {
    const { result } = renderHook(() => useExport());

    let file: Awaited<ReturnType<typeof result.current.createExport>> = null;
    await act(async () => {
      file = await result.current.createExport({
        format: "encrypted",
        masterPassword: PASSWORD,
        exportPassword: BACKUP_PASSWORD,
      });
    });

    expect(file).toMatchObject({ mimeType: "application/json", skipped: 1 });
    const { content } = file!;
    expect(content).not.toContain("mail-secret");
    const data = await decryptExport(content, BACKUP_PASSWORD);
    expect(data.vaults).toEqual([
      { id: local.vaults[0]!.vaultId, name: "Personal", kind: "personal" },
    ]);
    expect(data.records).toEqual([
      expect.objectContaining({ type: "login", title: "Mail", password: "mail-secret" }),
    ]);
    expect(data.records[0]).not.toHaveProperty("schemaVersion");

    // Only saving the file makes it the latest backup.
    expect(store.markExported).not.toHaveBeenCalled();
    await act(() => result.current.markSaved(file!));
    expect(store.markExported).toHaveBeenCalledWith(local.profile.profileId);
  });

  it("writes plain JSON behind the master password, without counting it as a backup", async () => {
    const { result } = renderHook(() => useExport());

    let file: Awaited<ReturnType<typeof result.current.createExport>> = null;
    await act(async () => {
      file = await result.current.createExport({ format: "json", masterPassword: PASSWORD });
    });

    const data = exportDataSchema.parse(JSON.parse(file!.content));
    expect(data.records.map((r) => r.title)).toEqual(["Mail"]);
    await act(() => result.current.markSaved(file!));
    expect(store.markExported).not.toHaveBeenCalled();
  });

  it.each([
    { format: "csv", masterPassword: "not it" },
    { format: "encrypted", masterPassword: "not it", exportPassword: BACKUP_PASSWORD },
  ] as const)("refuses a $format export with a wrong master password", async (request) => {
    const { result } = renderHook(() => useExport());

    await act(async () => {
      expect(await result.current.createExport(request)).toBeNull();
    });

    expect(result.current.exportError).toBe("wrong_password");
    expect(getAllLatest).not.toHaveBeenCalled();
  });

  it("fails a plain export without a password wrap to check against", async () => {
    store.accountKeyMaterial = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useExport());

    await act(async () => {
      await result.current.createExport({ format: "json", masterPassword: PASSWORD });
    });

    expect(result.current.exportError).toBe("failed");
  });

  it("reports a failed read", async () => {
    getAllLatest.mockRejectedValueOnce(new Error("disk"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useExport());

    await act(async () => {
      await result.current.createExport({
        format: "encrypted",
        masterPassword: PASSWORD,
        exportPassword: BACKUP_PASSWORD,
      });
    });

    expect(result.current.exportError).toBe("failed");
    expect(store.markExported).not.toHaveBeenCalled();
  });
});
