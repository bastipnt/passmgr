import type { VaultInvitation, VaultRole } from "@repo/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { SessionContext } from "../providers/SessionProvider";
import {
  type ActiveProfile,
  reloadVaultKeys,
  requireActive,
  useStore,
} from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import { copyRevokedRecords, getRevokedVaults } from "../vaults/revoked";
import {
  acceptInvitation,
  declineInvitation,
  fetchInvitations,
  getMembers,
  type Invitee,
  inviteMember,
  leaveVault,
  lookupInvitee,
  openInvitations,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "../vaults/sharing";
import { VaultsOfflineError } from "./use-vaults";

const INVITATIONS_KEY = "vault-invitations";
const MEMBERS_KEY = "vault-members";
const REVOKED_KEY = "revoked-vaults";

/**
 * The user's pending invites to other people's vaults, opened (ADR 0001 D7).
 * Only `online`: they live on the server. Re-read after every sync.
 */
export function useVaultInvitations() {
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const { revision } = useRecordsContext();
  const listed = useQuery({
    queryKey: [INVITATIONS_KEY, revision],
    enabled: mode === "online",
    queryFn: () => fetchInvitations(trpc),
  });
  // Opened (unsealed) once per distinct list, not on every sync.
  const boxes = (listed.data ?? []).map((i) => i.sealedVaultKey);
  const opened = useQuery({
    queryKey: [INVITATIONS_KEY, "opened", boxes],
    enabled: listed.data !== undefined,
    networkMode: "always",
    queryFn: () => openInvitations(listed.data ?? []),
  });
  return {
    invitations: opened.data ?? [],
    isPending: mode === "online" && (listed.isPending || opened.isPending),
    error: listed.error ?? opened.error,
  };
}

/** A vault's members and invitees with their key fingerprints. Only `online`. */
export function useVaultMembers(vaultId: string | undefined) {
  const store = useStore();
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const { revision } = useRecordsContext();
  const { data, isPending, error } = useQuery({
    queryKey: [MEMBERS_KEY, vaultId, revision],
    enabled: mode === "online" && !!vaultId,
    queryFn: () => getMembers({ vault: requireActive(store).vault, trpc }, vaultId!),
  });
  return { members: data ?? [], isPending: mode === "online" && isPending, error };
}

/**
 * Vaults the user lost access to while this device had unsent changes in them,
 * with those changes opened, to copy elsewhere or discard (`useVaultSharing`).
 */
export function useRevokedVaults() {
  const store = useStore();
  const { revision } = useRecordsContext();
  const { data } = useQuery({
    queryKey: [REVOKED_KEY, revision],
    networkMode: "always",
    queryFn: () => getRevokedVaults(requireActive(store).vault),
  });
  return data ?? [];
}

/**
 * Share vaults with other accounts (ADR 0001 D7): invite, accept or decline an
 * invite, change roles, remove members, leave, hand over ownership. All of it
 * goes through the server, so only `online` (else `VaultsOfflineError`); a
 * change to the user's own vault list syncs right after.
 */
export function useVaultSharing() {
  const store = useStore();
  const { mode } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  const { reload } = useRecordsContext();

  function online(): ActiveProfile {
    const active = requireActive(store);
    if (mode !== "online") throw new VaultsOfflineError();
    return active;
  }

  /** The server changed the user's vaults: pull them, load their keys, show them. */
  async function resync(active: ActiveProfile) {
    await active.syncManager.syncFresh();
    reloadVaultKeys(await active.vault.getVaults());
    await reload();
  }

  async function refreshMembers(vaultId: string) {
    await queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY, vaultId] });
  }

  const mutation = useMutation({
    networkMode: "always",
    mutationFn: async (run: () => Promise<unknown>) => await run(),
  });

  const act = <T>(run: () => Promise<T>) => mutation.mutateAsync(run) as Promise<T>;

  return {
    /** Look up who to invite; show `fingerprint` for the user to compare before inviting. */
    lookupInvitee: (email: string) =>
      act(async () => {
        online();
        return await lookupInvitee(trpc, email);
      }),
    invite: (vaultId: string, invitee: Invitee, role: VaultRole) =>
      act(async () => {
        const active = online();
        await inviteMember({ vault: active.vault, trpc }, vaultId, invitee, role);
        await refreshMembers(vaultId);
      }),
    /** Accept after the user compared `senderFingerprint`; the vault shows after the sync. */
    acceptInvitation: (invitation: VaultInvitation) =>
      act(async () => {
        const active = online();
        await acceptInvitation({ vault: active.vault, trpc }, invitation);
        await queryClient.invalidateQueries({ queryKey: [INVITATIONS_KEY] });
        await resync(active);
      }),
    declineInvitation: (vaultId: string) =>
      act(async () => {
        online();
        await declineInvitation(trpc, vaultId);
        await queryClient.invalidateQueries({ queryKey: [INVITATIONS_KEY] });
      }),
    setMemberRole: (vaultId: string, userId: string, role: VaultRole) =>
      act(async () => {
        const active = online();
        await setMemberRole(trpc, vaultId, userId, role);
        await refreshMembers(vaultId);
        // The user's own role may have changed.
        await resync(active);
      }),
    /** Removes the member, then rotates the vault's key (`removeMember`). */
    removeMember: (vaultId: string, userId: string) =>
      act(async () => {
        const active = online();
        await removeMember({ vault: active.vault, trpc }, vaultId, userId);
        reloadVaultKeys(await active.vault.getVaults());
        await refreshMembers(vaultId);
        await resync(active);
      }),
    leaveVault: (vaultId: string) =>
      act(async () => {
        const active = online();
        await leaveVault({ vault: active.vault, trpc }, vaultId);
        await resync(active);
      }),
    transferOwnership: (vaultId: string, userId: string) =>
      act(async () => {
        const active = online();
        await transferOwnership(trpc, vaultId, userId);
        await refreshMembers(vaultId);
        await resync(active);
      }),
    /** Copy a revoked vault's unsent records into a vault the user has (personal by default). */
    copyRevokedRecords: (vaultId: string, targetVaultId?: string) =>
      act(async () => {
        const active = requireActive(store);
        const copied = await copyRevokedRecords(active, vaultId, targetVaultId);
        active.syncManager.requestSync();
        await queryClient.invalidateQueries({ queryKey: [REVOKED_KEY] });
        await reload();
        return copied;
      }),
    discardRevokedVault: (vaultId: string) =>
      act(async () => {
        await requireActive(store).vault.discardRevokedVault(vaultId);
        await queryClient.invalidateQueries({ queryKey: [REVOKED_KEY] });
      }),
    pending: mutation.isPending,
    /** Sharing goes through the server: only while online. */
    canShare: mode === "online",
  };
}
