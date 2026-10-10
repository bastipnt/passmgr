import { useVaultActions, VaultsOfflineError } from "@repo/client/src/hooks/use-vaults";
import { SessionContext, type SessionMode } from "@repo/client/src/providers/SessionProvider";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    vaults: [] as MemberVault[],
    reload: vi.fn(async () => void calls.push("reload")),
    reloadVaultKeys: vi.fn(() => void calls.push("keys")),
    trpc: {
      vault: {
        create: { mutate: vi.fn(async () => void calls.push("server.create")) },
        updateMeta: { mutate: vi.fn(async () => void calls.push("server.updateMeta")) },
        delete: { mutate: vi.fn(async () => void calls.push("server.delete")) },
      },
    },
    syncFresh: vi.fn(async () => {
      calls.push("syncFresh");
      return true;
    }),
  };
});

const vault = {
  getVaults: vi.fn(async () => mocks.vaults),
  saveVault: vi.fn(async () => void mocks.calls.push("saveVault")),
  setVaultMeta: vi.fn(async () => void mocks.calls.push("setVaultMeta")),
  removeVault: vi.fn(async () => void mocks.calls.push("removeVault")),
};
const active = { vault, syncManager: { syncFresh: mocks.syncFresh } };

vi.mock("@repo/client/src/providers/StoreProvider", () => ({
  useStore: () => ({ current: () => active }),
  requireActive: (store: { current: () => unknown }) => store.current(),
  reloadVaultKeys: mocks.reloadVaultKeys,
}));
vi.mock("@repo/client/src/providers/RecordsProvider", () => ({
  useRecordsContext: () => ({ reload: mocks.reload, vaults: [] }),
}));
vi.mock("@repo/client/src/util/trpc", () => ({ useTRPCClient: () => mocks.trpc }));

const created = {
  vaultId: "v-new",
  keyVersion: 1 as const,
  encryptedVaultKey: "k",
  vaultKeyEncryptionNonce: "kn",
  encryptedMeta: "m",
  metaEncryptionNonce: "mn",
};
const encryptedMeta = { encryptedMeta: "m2", metaEncryptionNonce: "mn2" };

function render(mode: SessionMode) {
  const queryClient = new QueryClient();
  const session = { vaultUnlocked: true, mode } as ContextType<typeof SessionContext>;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  );
  return renderHook(() => useVaultActions(), { wrapper }).result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.vaults = [];
  vi.spyOn(secretsStore, "createVault").mockReturnValue(created);
  vi.spyOn(secretsStore, "encryptVaultMeta").mockReturnValue(encryptedMeta);
  vi.spyOn(secretsStore, "defaultVaultId", "get").mockReturnValue("v-personal");
});

describe("useVaultActions", () => {
  it("local: creates, renames and deletes on the device only", async () => {
    const result = render("local");

    await act(async () => {
      expect(await result.current.createVault({ name: "Work" })).toBe("v-new");
      await result.current.renameVault("v-new", { name: "Job" });
      await result.current.deleteVault("v-new");
    });

    expect(vault.saveVault).toHaveBeenCalledWith({ ...created, kind: "shared", role: "owner" });
    expect(vault.setVaultMeta).toHaveBeenCalledWith("v-new", encryptedMeta);
    expect(vault.removeVault).toHaveBeenCalledWith("v-new");
    expect(mocks.trpc.vault.create.mutate).not.toHaveBeenCalled();
    expect(mocks.trpc.vault.updateMeta.mutate).not.toHaveBeenCalled();
    expect(mocks.trpc.vault.delete.mutate).not.toHaveBeenCalled();
    expect(mocks.syncFresh).not.toHaveBeenCalled();
    expect(result.current.canChangeVaults).toBe(true);
  });

  it("online: the server first, then a fresh sync, then the device; keys and list reloaded last", async () => {
    // The fresh sync brought the new vault: no local copy needed.
    mocks.syncFresh.mockImplementationOnce(async () => {
      mocks.calls.push("syncFresh");
      mocks.vaults = [{ ...created, kind: "shared", role: "owner" }];
      return true;
    });
    const result = render("online");

    await act(async () => {
      await result.current.createVault({ name: "Work" });
    });
    expect(mocks.calls).toEqual(["server.create", "syncFresh", "keys", "reload"]);
    expect(vault.saveVault).not.toHaveBeenCalled();

    mocks.calls.length = 0;
    await act(async () => {
      await result.current.renameVault("v-new", { name: "Job" });
    });
    expect(mocks.calls).toEqual([
      "server.updateMeta",
      "syncFresh",
      "setVaultMeta",
      "keys",
      "reload",
    ]);

    mocks.calls.length = 0;
    await act(async () => {
      await result.current.deleteVault("v-new");
    });
    expect(mocks.calls).toEqual(["server.delete", "syncFresh", "removeVault", "keys", "reload"]);
  });

  it("online: shows a created vault right away when the sync after it fails", async () => {
    mocks.syncFresh.mockResolvedValueOnce(false);
    const result = render("online");

    await act(async () => {
      await result.current.createVault({ name: "Work" });
    });

    expect(vault.saveVault).toHaveBeenCalledWith({ ...created, kind: "shared", role: "owner" });
  });

  it("offline (linked, no session): refuses every change without touching server or device", async () => {
    const result = render("offline");
    expect(result.current.canChangeVaults).toBe(false);

    for (const change of [
      () => result.current.createVault({ name: "Work" }),
      () => result.current.renameVault("v-work", { name: "Job" }),
      () => result.current.deleteVault("v-work"),
    ]) {
      await act(async () => {
        await expect(change()).rejects.toBeInstanceOf(VaultsOfflineError);
      });
    }
    expect(mocks.calls).toEqual([]);
  });

  it("never deletes the personal vault", async () => {
    const result = render("online");

    await act(async () => {
      await expect(result.current.deleteVault("v-personal")).rejects.toThrow(/personal/);
    });
    expect(mocks.calls).toEqual([]);
  });

  it("a failed server call leaves the device as it was", async () => {
    mocks.trpc.vault.delete.mutate.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const result = render("online");

    await act(async () => {
      await expect(result.current.deleteVault("v-work")).rejects.toThrow("FORBIDDEN");
    });
    expect(vault.removeVault).not.toHaveBeenCalled();
    expect(mocks.syncFresh).not.toHaveBeenCalled();
  });
});
