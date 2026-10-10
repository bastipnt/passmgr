import { canWriteVault, type MemberVault, type VaultMeta } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useMutation } from "@tanstack/react-query";
import { useContext, useMemo } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { SessionContext } from "../providers/SessionProvider";
import {
  type ActiveProfile,
  reloadVaultKeys,
  requireActive,
  useStore,
} from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import type { VaultInfo } from "../vaults/vault-info";

/** A linked profile changes its vaults on the server: without a session it can't. */
export class VaultsOfflineError extends Error {
  override message = "Connect to the server to change your vaults";
}

/** The unlocked profile's vaults (personal first), and lookups over them. */
export function useVaults() {
  const { vaults } = useRecordsContext();
  return useMemo(() => {
    const byId = new Map(vaults.map((vault) => [vault.vaultId, vault]));
    return {
      vaults,
      /** The vaults the user may write records into (create, move targets). */
      writableVaults: vaults.filter((vault) => canWriteVault(vault.role)),
      getVault: (vaultId: string): VaultInfo | undefined => byId.get(vaultId),
      /** Whether the list should tell vaults apart at all: more than one exists. */
      hasSeveralVaults: vaults.length > 1,
    };
  }, [vaults]);
}

/**
 * Create, rename and delete vaults (ADR 0001 D6). A `local` profile changes
 * them on the device only; a linked one on the server first (`online` only:
 * `offline` throws `VaultsOfflineError`), then on the device, so the change
 * shows before the next sync confirms it. Deleting drops the vault with its
 * records, history and unsent changes from the device.
 */
export function useVaultActions() {
  const store = useStore();
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const { reload } = useRecordsContext();

  // TODO: why not offline-first here?

  /** The server is asked first, unless the profile has none. */
  function viaServer(): boolean {
    if (mode === "local") return false;
    if (mode === "online") return true;
    throw new VaultsOfflineError();
  }

  /** The device's vault list changed: load its keys, then show it. */
  async function refresh(active: ActiveProfile) {
    reloadVaultKeys(await active.vault.getVaults());
    await reload();
  }

  const create = useMutation({
    networkMode: "always",
    mutationFn: async (meta: VaultMeta): Promise<string> => {
      const active = requireActive(store);
      const server = viaServer();
      const created = secretsStore.createVault(meta);
      const member: MemberVault = { ...created, kind: "shared", role: "owner" };
      if (server) {
        await trpc.vault.create.mutate(created);
        // A fresh round, so no pull from before the create drops it again.
        await active.syncManager.syncFresh();
        const listed = (await active.vault.getVaults()).some((v) => v.vaultId === created.vaultId);
        // The sync failed (offline meanwhile): show it now, the next sync confirms it.
        if (!listed) await active.vault.saveVault(member);
      } else {
        await active.vault.saveVault(member);
      }
      await refresh(active);
      return created.vaultId;
    },
  });

  const rename = useMutation({
    networkMode: "always",
    mutationFn: async ({ vaultId, meta }: { vaultId: string; meta: VaultMeta }) => {
      const active = requireActive(store);
      const server = viaServer();
      const encrypted = secretsStore.encryptVaultMeta(vaultId, meta);
      if (server) {
        await trpc.vault.updateMeta.mutate({ vaultId, ...encrypted });
        // As for a create: a pull from before the rename would bring the old name back.
        await active.syncManager.syncFresh();
      }
      // Already in place after a sync that went through; shown now if it didn't.
      await active.vault.setVaultMeta(vaultId, encrypted);
      await refresh(active);
    },
  });

  const remove = useMutation({
    networkMode: "always",
    mutationFn: async (vaultId: string) => {
      const active = requireActive(store);
      if (vaultId === secretsStore.defaultVaultId)
        throw new Error("The personal vault can't be deleted");
      if (viaServer()) {
        await trpc.vault.delete.mutate({ vaultId });
        // As for a create: a pull from before the delete would list the vault again.
        await active.syncManager.syncFresh();
      }
      // A sync that went through dropped it already: then this removes nothing.
      await active.vault.removeVault(vaultId);
      await refresh(active);
    },
  });

  return {
    /** Resolves the new vault's id. */
    createVault: create.mutateAsync,
    renameVault: (vaultId: string, meta: VaultMeta) => rename.mutateAsync({ vaultId, meta }),
    deleteVault: remove.mutateAsync,
    pending: create.isPending || rename.isPending || remove.isPending,
    /** Vaults change on the server for a linked profile: not while it's offline. */
    canChangeVaults: mode === "local" || mode === "online",
  };
}
