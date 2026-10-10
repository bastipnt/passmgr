import { useVaultActions, VaultsOfflineError } from "@repo/client/src/hooks/use-vaults";
import { SessionContext, type SessionMode } from "@repo/client/src/providers/SessionProvider";
import {
  VaultKeyRotatedElsewhereError,
  VaultMembersChangedError,
} from "@repo/client/src/vaults/sharing";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
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
        rotateKey: { mutate: vi.fn(async () => void calls.push("server.rotateKey")) },
        members: { query: vi.fn(async () => [] as unknown[]) },
      },
    },
    reencryptForPush: vi.fn(async () => void calls.push("reencrypt")),
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
  setRekeyTarget: vi.fn(async () => void mocks.calls.push("setRekeyTarget")),
  clearRekeyTarget: vi.fn(async () => void mocks.calls.push("clearRekeyTarget")),
  getProfile: vi.fn(async () => ({
    profileId: "p",
    mode: "linked",
    email: "me@x.y",
    userId: "u-me",
  })),
  getPeerKey: vi.fn(async () => null),
  pinPeerKey: vi.fn(async () => undefined),
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
vi.mock("@repo/client/src/vaults/rekey", () => ({ reencryptForPush: mocks.reencryptForPush }));

const created = {
  vaultId: "v-new",
  keyVersion: 1 as const,
  encryptedVaultKey: "k",
  vaultKeyEncryptionNonce: "kn",
  encryptedMeta: "m",
  metaEncryptionNonce: "mn",
  previousKeys: [],
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

  describe("rotateVaultKey", () => {
    const work: MemberVault = { ...created, vaultId: "v-work", kind: "shared", role: "owner" };
    const rotation = {
      vaultId: "v-work",
      keyVersion: 2,
      encryptedVaultKey: "k2",
      vaultKeyEncryptionNonce: "kn2",
      ...encryptedMeta,
      previousKey: { keyVersion: 1, encryptedVaultKey: "pk", vaultKeyEncryptionNonce: "pkn" },
    };
    const { previousKey, ...wrap } = rotation;
    const next = { ...work, ...wrap, previousKeys: [previousKey] };

    const bob = {
      userId: "u-bob",
      email: "bob@x.y",
      role: "write",
      status: "active",
      publicKey: { keyVersion: 1, publicKey: "pk-bob" },
    };
    const sealed = { userId: "u-bob", recipientKeyVersion: 1, sealedVaultKey: "sealed" };

    beforeEach(() => {
      mocks.vaults = [work];
      vi.spyOn(secretsStore, "rotateVaultKey").mockResolvedValue({ ...rotation, memberKeys: [] });
      vi.spyOn(secretsStore, "userKeyVersion", "get").mockReturnValue(1);
    });

    it("local: notes the rotation, stores the new key and re-encrypts on the device", async () => {
      const result = render("local");

      await act(async () => {
        await result.current.rotateVaultKey("v-work");
      });

      expect(vault.setRekeyTarget).toHaveBeenCalledWith("v-work", 2);
      expect(vault.saveVault).toHaveBeenCalledWith(next);
      expect(mocks.calls).toEqual(["setRekeyTarget", "saveVault", "keys", "reencrypt", "reload"]);
      expect(mocks.trpc.vault.rotateKey.mutate).not.toHaveBeenCalled();
    });

    it("online: notes it before the server, then a sync pushes the re-encrypted records", async () => {
      const result = render("online");

      await act(async () => {
        await result.current.rotateVaultKey("v-work");
      });

      expect(mocks.trpc.vault.rotateKey.mutate).toHaveBeenCalledWith({
        ...rotation,
        senderKeyVersion: 1,
        memberKeys: [],
      });
      expect(mocks.calls).toEqual([
        "setRekeyTarget",
        "server.rotateKey",
        "saveVault",
        "keys",
        "syncFresh",
        "reload",
      ]);
    });

    const membersChanged = () =>
      new TRPCClientError("refused", {
        result: { error: { code: -32_000, message: "x", data: { code: "PRECONDITION_FAILED" } } },
      });

    it("online: seals the new key to the other members (pinning their keys)", async () => {
      mocks.trpc.vault.members.query.mockResolvedValueOnce([
        { ...bob, userId: "u-me", email: "me@x.y" },
        bob,
      ]);
      vi.mocked(secretsStore.rotateVaultKey).mockResolvedValue({
        ...rotation,
        memberKeys: [sealed],
      });
      const result = render("online");

      await act(async () => {
        await result.current.rotateVaultKey("v-work");
      });

      expect(secretsStore.rotateVaultKey).toHaveBeenCalledWith(work, [bob]);
      expect(vault.pinPeerKey).toHaveBeenCalledWith("u-bob", bob.publicKey);
      expect(mocks.trpc.vault.rotateKey.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ memberKeys: [sealed] }),
      );
    });

    it("online: refuses to seal to a member whose key changed since it was pinned", async () => {
      mocks.trpc.vault.members.query.mockResolvedValueOnce([bob]);
      vault.getPeerKey.mockResolvedValueOnce({ keyVersion: 1, publicKey: "pk-other" } as never);
      const result = render("online");

      await act(async () => {
        await expect(result.current.rotateVaultKey("v-work")).rejects.toThrow("key changed");
      });
      expect(secretsStore.rotateVaultKey).not.toHaveBeenCalled();
      expect(mocks.trpc.vault.rotateKey.mutate).not.toHaveBeenCalled();
    });

    it("online: fetches the members again once when they changed meanwhile", async () => {
      mocks.trpc.vault.rotateKey.mutate.mockRejectedValueOnce(membersChanged());
      const result = render("online");

      await act(async () => {
        await result.current.rotateVaultKey("v-work");
      });

      expect(mocks.trpc.vault.members.query).toHaveBeenCalledTimes(2);
      expect(vault.clearRekeyTarget).toHaveBeenCalledTimes(1);
      expect(vault.saveVault).toHaveBeenCalledWith(next);
    });

    it("online: forgets the rotation when the server keeps refusing it", async () => {
      mocks.trpc.vault.rotateKey.mutate
        .mockRejectedValueOnce(membersChanged())
        .mockRejectedValueOnce(membersChanged());
      const result = render("online");

      await act(async () => {
        await expect(result.current.rotateVaultKey("v-work")).rejects.toBeInstanceOf(
          VaultMembersChangedError,
        );
      });

      expect(vault.clearRekeyTarget).toHaveBeenCalledWith("v-work", 2);
      expect(vault.saveVault).not.toHaveBeenCalled();
    });

    it("online: picks up the other device's key when it rotated first", async () => {
      mocks.trpc.vault.rotateKey.mutate.mockRejectedValueOnce(
        new TRPCClientError("conflict", {
          result: { error: { code: -32_000, message: "x", data: { code: "CONFLICT" } } },
        }),
      );
      const result = render("online");

      await act(async () => {
        await expect(result.current.rotateVaultKey("v-work")).rejects.toBeInstanceOf(
          VaultKeyRotatedElsewhereError,
        );
      });

      // Not this device's rotation: it must not rewrite the records too.
      expect(vault.clearRekeyTarget).toHaveBeenCalledWith("v-work", 2);
      expect(mocks.calls).toEqual(["setRekeyTarget", "clearRekeyTarget", "syncFresh", "reload"]);
    });

    it("online: keeps the rotation noted when the server didn't answer", async () => {
      mocks.trpc.vault.rotateKey.mutate.mockRejectedValueOnce(new Error("offline"));
      const result = render("online");

      await act(async () => {
        await expect(result.current.rotateVaultKey("v-work")).rejects.toThrow("offline");
      });

      // It may have gone through: a later sync finishes it once the vault is at key 2.
      expect(vault.clearRekeyTarget).not.toHaveBeenCalled();
    });

    it("offline: refused before anything changes", async () => {
      const result = render("offline");

      await act(async () => {
        await expect(result.current.rotateVaultKey("v-work")).rejects.toBeInstanceOf(
          VaultsOfflineError,
        );
      });
      expect(vault.setRekeyTarget).not.toHaveBeenCalled();
    });
  });
});
