import { buildExportData, SessionContext, useRestoreBackup } from "@repo/client";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

// Real hook, keyring and import plan; the store, the session and the record list are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
const reload = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@repo/client/src/hooks/use-records", async (importActual) => ({
  ...(await importActual<object>()),
  useReloadRecords: () => reload,
}));
vi.mock("@repo/crypto/services/decrypt-worker-service", () => ({
  decryptWorkerService: { init: vi.fn() },
}));

// Like the real session: loads the new vault's keys.
const session = {
  vaultUnlocked: false,
  networkOffline: false,
  unlockWithAccountKey: (_mode: string, accountKey: Uint8Array, vaults: MemberVault[]) => {
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(vaults);
  },
} as unknown as ContextType<typeof SessionContext>;

function renderRestore() {
  return renderHook(() => useRestoreBackup(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    ),
  });
}

const OLD_VAULT = "44444444-4444-4444-8444-444444444444";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const data = buildExportData(
  [{ id: OLD_VAULT, name: "Personal", kind: "personal" }],
  [
    {
      type: "login",
      id: RECORD_ID,
      vaultId: OLD_VAULT,
      title: "Mail",
      password: "mail-secret",
      createdAt: null,
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
  ],
);

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

beforeEach(() => {
  Object.assign(store, { profiles: [], profile: null, accountKeyMaterial: null });
  store.createLocalVault.mockImplementation(async (_material, _recovery, _vaults, profile) => {
    store.profiles = [...store.profiles, profileEntry(profile)];
    store.profile = profile;
  });
  vi.spyOn(secretsStore, "exportVaultKeysForWorker").mockReturnValue(new Map());
});
afterEach(() => {
  secretsStore.lock();
  vi.clearAllMocks();
});

describe("useRestoreBackup", () => {
  it("creates a local vault, then imports every record into its personal vault", async () => {
    const { result } = renderRestore();

    let recoveryKey: Uint8Array | undefined;
    await act(async () => {
      recoveryKey = await result.current.restore(data, "hunter2hunter2", "Restored");
    });
    expect(recoveryKey).toHaveLength(32);
    expect(store.createLocalVault.mock.calls[0]![4]).toBe("Restored");
    // Nothing is written before the vault is unlocked.
    expect(store.records.writeImport).not.toHaveBeenCalled();

    let restored: Awaited<ReturnType<typeof result.current.finishRestore>> = null;
    await act(async () => {
      restored = await result.current.finishRestore();
    });

    expect(restored).toEqual({ created: 1, updated: 0, skipped: 0 });
    const personal = secretsStore.defaultVaultId;
    const [entries] = store.records.writeImport.mock.calls[0]! as unknown as [
      { kind: string; recordId: string; vaultId: string; data: object }[],
    ];
    expect(entries).toEqual([
      {
        kind: "create",
        // Kept: importing the file again after a failure finds it.
        recordId: RECORD_ID,
        vaultId: personal,
        data: { type: "login", title: "Mail", password: "mail-secret" },
      },
    ]);
    expect(reload).toHaveBeenCalled();
  });

  it("reports a failed import; the vault stays open", async () => {
    store.records.writeImport.mockRejectedValueOnce(new Error("disk"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderRestore();

    await act(async () => {
      await result.current.restore(data, "hunter2hunter2");
    });
    await act(async () => {
      expect(await result.current.finishRestore()).toBeNull();
    });

    expect(result.current.restoreError).toBe("import_failed");
    expect(secretsStore.defaultVaultId).toBeDefined();
  });

  it("does nothing on finish without a created vault", async () => {
    store.createLocalVault.mockRejectedValueOnce(new Error("disk"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderRestore();

    await act(async () => {
      expect(await result.current.restore(data, "hunter2hunter2")).toBeUndefined();
    });
    await act(async () => {
      expect(await result.current.finishRestore()).toBeNull();
    });

    expect(result.current.restoreError).toBe("failed");
    expect(store.records.writeImport).not.toHaveBeenCalled();
  });
});
