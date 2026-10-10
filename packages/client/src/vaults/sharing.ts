import { publicKeyFingerprint } from "@repo/crypto";
import type {
  MemberVault,
  UserPublicKey,
  VaultInvitation,
  VaultKeyUpdate,
  VaultMember,
  VaultMeta,
  VaultRole,
} from "@repo/schema";
import { canManageVault } from "@repo/schema";
import { secretsStore, type Vault } from "@repo/store";
import { TRPCClientError } from "@trpc/client";
import type { useTRPCClient } from "../util/trpc";
import {
  isConflict,
  isPreconditionFailed,
  isRetryLater,
  isServerAnswer,
  isServerError,
  isUnauthorized,
} from "../util/trpc-errors";

/*
 * Sharing a vault between accounts (ADR 0001 D7), the client side. A vault key
 * reaches another member sealed to their public key from this user's keypair;
 * the member opens it, checks who sealed it and stores their own wrap.
 *
 * Public keys come from the server, which could hand out its own in place of a
 * member's. Each device pins the keys it has used for every other user
 * (`Vault.pinPeerKey`): the invitee's when inviting (after the user compared
 * its fingerprint), the inviter's when accepting, any other member's on first
 * use. A key that differs from the pin later is refused, both for sealing to
 * and for opening from (`PeerKeyChangedError`).
 */

type TrpcClient = ReturnType<typeof useTRPCClient>;

/** What the sharing calls need: the profile's database and the server. */
export type SharingDeps = { vault: Vault; trpc: TrpcClient };

/** The server handed out a public key for a user that isn't the one this device pinned. */
export class PeerKeyChangedError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super("This person's key changed since you last shared with them. Compare their fingerprint.");
    this.userId = userId;
  }
}

/** The vault's members changed while it was being rotated, again and again. */
export class VaultMembersChangedError extends Error {
  override message = "The vault's members changed during the key rotation. Try again.";
}

/** Another device rotated the vault's key first; the sync after it brought the new key. */
export class VaultKeyRotatedElsewhereError extends Error {
  override message = "This vault's key was just rotated on another device";
}

/** Refuse a key that differs from the one pinned for `userId`; pin it when none is. */
async function checkPeerKey(vault: Vault, userId: string, key: UserPublicKey): Promise<void> {
  const pinned = await vault.getPeerKey(userId);
  if (!pinned) {
    await vault.pinPeerKey(userId, key);
    return;
  }
  if (pinned.publicKey !== key.publicKey || pinned.keyVersion !== key.keyVersion) {
    throw new PeerKeyChangedError(userId);
  }
}

/** The signed-in user's id; sharing needs a linked profile. */
async function ownUserId(vault: Vault): Promise<string> {
  const profile = await vault.getProfile();
  if (profile?.mode !== "linked") throw new Error("Sharing needs an online account");
  return profile.userId;
}

/**
 * INVITES
 */

/** Someone to invite: their current public key and its fingerprint, to compare out of band. */
export type Invitee = { email: string; publicKey: UserPublicKey; fingerprint: string };

/** Look up a user to invite by email. NOT_FOUND (from the server) when there's no such account. */
export async function lookupInvitee(trpc: TrpcClient, email: string): Promise<Invitee> {
  const publicKey = await trpc.user.publicKey.query({ email });
  return { email, publicKey, fingerprint: publicKeyFingerprint(publicKey.publicKey) };
}

/**
 * Invite `invitee` (looked up and verified with `lookupInvitee`) into a vault
 * with `role`: the vault's current key sealed to their key. Pins their key once
 * the server lists them, so a later rotation seals to the same key.
 */
export async function inviteMember(
  { vault, trpc }: SharingDeps,
  vaultId: string,
  invitee: Invitee,
  role: VaultRole,
): Promise<void> {
  const { sealedVaultKey, keyVersion } = await secretsStore.sealVaultKeyTo(
    vaultId,
    invitee.publicKey,
  );
  await trpc.vault.invite.mutate({
    vaultId,
    email: invitee.email,
    role,
    keyVersion,
    recipientKeyVersion: invitee.publicKey.keyVersion,
    senderKeyVersion: secretsStore.userKeyVersion,
    sealedVaultKey,
  });
  const listed = (await trpc.vault.members.query({ vaultId })).find(
    (m) => m.email === invitee.email && m.publicKey.publicKey === invitee.publicKey.publicKey,
  );
  if (listed) {
    await checkPeerKey(vault, listed.userId, listed.publicKey);
    // Invited back: their key updates count again.
    await vault.markPeerRemoved(vaultId, listed.userId, false);
  }
}

/** An invite as the invitee sees it, opened: the vault's name and who invited them. */
export type OpenedInvitation = {
  invitation: VaultInvitation;
  meta: VaultMeta;
  /** The inviter's key fingerprint, for the invitee to compare out of band. */
  senderFingerprint: string;
};

/** The user's pending invites, as the server lists them (`openInvitations` opens them). */
export async function fetchInvitations(trpc: TrpcClient): Promise<VaultInvitation[]> {
  return await trpc.vault.invitations.query();
}

/**
 * Open invites. One that doesn't open (not sealed from the named inviter's
 * key, or to this keypair) is left out.
 */
export async function openInvitations(
  invitations: readonly VaultInvitation[],
): Promise<OpenedInvitation[]> {
  const opened: OpenedInvitation[] = [];
  for (const invitation of invitations) {
    try {
      const { meta } = await secretsStore.openInvitation(invitation);
      opened.push({
        invitation,
        meta,
        senderFingerprint: publicKeyFingerprint(invitation.sender.publicKey),
      });
    } catch (error) {
      console.warn(`Invite to ${invitation.vaultId} doesn't open`, error);
    }
  }
  return opened;
}

/**
 * Accept an invite: the key opened from the inviter, wrapped under this user's
 * account key and stored on the server. Pins the inviter's key (the user just
 * compared its fingerprint). The vault arrives with the next sync.
 */
export async function acceptInvitation(
  { vault, trpc }: SharingDeps,
  invitation: VaultInvitation,
): Promise<void> {
  const { sender } = invitation;
  await checkPeerKey(vault, sender.userId, sender);
  const { wrap } = await secretsStore.openInvitation(invitation);
  await trpc.vault.acceptKey.mutate(wrap);
}

export async function declineInvitation(trpc: TrpcClient, vaultId: string): Promise<void> {
  await trpc.vault.declineInvite.mutate({ vaultId });
}

/**
 * MEMBERS
 */

/** A member with their key's fingerprint and whether it's the one this device pinned. */
export type MemberInfo = VaultMember & {
  fingerprint: string;
  /** `false`: the server lists another key than the one pinned for them (`PeerKeyChangedError`). */
  keyTrusted: boolean;
  isSelf: boolean;
};

export async function getMembers(
  { vault, trpc }: SharingDeps,
  vaultId: string,
): Promise<MemberInfo[]> {
  const self = await ownUserId(vault);
  const members = await trpc.vault.members.query({ vaultId });
  return await Promise.all(
    members.map(async (member) => {
      const pinned = await vault.getPeerKey(member.userId);
      return {
        ...member,
        fingerprint: publicKeyFingerprint(member.publicKey.publicKey),
        keyTrusted: !pinned || pinned.publicKey === member.publicKey.publicKey,
        isSelf: member.userId === self,
      };
    }),
  );
}

export async function setMemberRole(
  trpc: TrpcClient,
  vaultId: string,
  userId: string,
  role: VaultRole,
): Promise<void> {
  await trpc.vault.setMemberRole.mutate({ vaultId, userId, role });
}

export async function transferOwnership(
  trpc: TrpcClient,
  vaultId: string,
  userId: string,
): Promise<void> {
  await trpc.vault.transferOwnership.mutate({ vaultId, userId });
}

/**
 * Remove a member (or withdraw an invite), then rotate the vault's key right
 * away so they can't read what's written from now on. Should the rotation
 * fail, the server keeps the vault marked and the next sync of a manager
 * retries it (`rotationsDue`).
 */
export async function removeMember(
  deps: SharingDeps,
  vaultId: string,
  userId: string,
): Promise<void> {
  await deps.trpc.vault.removeMember.mutate({ vaultId, userId });
  // They still know the current key: no key update sealed by them is taken for this vault.
  await deps.vault.markPeerRemoved(vaultId, userId);
  try {
    await rotateVault(deps, vaultId);
  } catch (error) {
    console.warn(`Rotation after removing a member of ${vaultId} failed; retried on sync`, error);
  }
}

/**
 * Leave a shared vault: it goes from this device right away; its unsent
 * changes are kept aside to copy elsewhere (`getRevokedVaults`).
 */
export async function leaveVault({ vault, trpc }: SharingDeps, vaultId: string): Promise<void> {
  await trpc.vault.leave.mutate({ vaultId });
  await vault.removeVault(vaultId, { keepUnsent: true });
}

/**
 * ROTATION
 */

/**
 * Rotate a vault's key (ADR 0001 D7; owners and managers): a new key for
 * everything written from now on, the old one kept under it for the history,
 * and, for a linked profile, the new key sealed to every other member. The
 * device notes the rotation before the server sees it, so the re-encryption of
 * the live records carries on with a later sync should this stop halfway.
 * Doesn't sync: the caller does (`syncFresh`), or the round that called it
 * runs again, after loading the new key (`reloadVaultKeys`); a local vault then
 * re-encrypts its records (`reencryptForPush`). Resolves the vault as rotated.
 *
 * A member list that moved on meanwhile (PRECONDITION_FAILED) is fetched again
 * once; CONFLICT means another rotation won (`VaultKeyRotatedElsewhereError`).
 */
export async function rotateVault(
  deps: { vault: Vault; trpc: TrpcClient | null },
  vaultId: string,
): Promise<MemberVault> {
  const { vault: store, trpc } = deps;
  const vault = (await store.getVaults()).find((v) => v.vaultId === vaultId);
  if (!vault) throw new Error(`No vault ${vaultId}`);

  for (let attempt = 0; ; attempt++) {
    const members = trpc ? await otherMembers({ vault: store, trpc }, vaultId) : [];
    const { previousKey, memberKeys, ...rotated } = await secretsStore.rotateVaultKey(
      vault,
      members,
    );
    const next: MemberVault = {
      ...vault,
      ...rotated,
      previousKeys: [...vault.previousKeys, previousKey],
    };
    await store.setRekeyTarget(vaultId, next.keyVersion);

    if (trpc) {
      try {
        await trpc.vault.rotateKey.mutate({
          ...rotated,
          previousKey,
          senderKeyVersion: secretsStore.userKeyVersion,
          memberKeys,
        });
      } catch (e) {
        // Refused (not just unanswered): the vault stays at its key, so must its records.
        if (isServerAnswer(e) && !isServerError(e) && !isRetryLater(e)) {
          await store.clearRekeyTarget(vaultId, next.keyVersion);
        }
        if (isPreconditionFailed(e)) {
          if (attempt === 0) continue;
          throw new VaultMembersChangedError();
        }
        if (isConflict(e)) throw new VaultKeyRotatedElsewhereError();
        throw e;
      }
    }
    // In place before the sync: its push re-encrypts the records under the new key.
    await store.saveVault(next);
    return next;
  }
}

/** Every other member and invitee with their public key, each checked against its pin. */
async function otherMembers(deps: SharingDeps, vaultId: string) {
  const self = await ownUserId(deps.vault);
  const others = (await deps.trpc.vault.members.query({ vaultId })).filter(
    (m) => m.userId !== self,
  );
  for (const member of others) await checkPeerKey(deps.vault, member.userId, member.publicKey);
  return others;
}

/**
 * SYNC TASKS
 */

/** What a pull hands the client to do for sharing (`record.sync`). */
export type SharingTasks = { keyUpdates: VaultKeyUpdate[]; rotationsDue: string[] };

/** Tasks that failed, by `vaultId/keyVersion`, per profile: not retried on every sync of this session. */
const failedTasks = new WeakMap<Vault, Set<string>>();

function failedTasksOf(vault: Vault): Set<string> {
  let failed = failedTasks.get(vault);
  if (!failed) {
    failed = new Set();
    failedTasks.set(vault, failed);
  }
  return failed;
}

/** The sender of a key update isn't someone who may hand out this vault's keys. */
export class UntrustedKeySenderError extends Error {
  override message = "The new vault key wasn't sealed by a current owner or manager";
}

/**
 * A request that didn't get through or whose session was rejected: about the
 * connection, not the task, so it ends the tasks without counting against one.
 */
function isRequestFailure(error: unknown): boolean {
  return error instanceof TRPCClientError && (!isServerAnswer(error) || isUnauthorized(error));
}

/**
 * Whether `sender` may hand out the vault's keys: not removed by this device
 * (they'd still know the key before the rotation and could chain a forged one
 * to it), and listed by the server as an active owner or manager with this
 * public key. The listing is the server's word; together with the pins it
 * means a server forging a rotation with a former member must also lie about
 * the membership to every device that didn't see the removal.
 */
async function trustedSender(
  deps: SharingDeps,
  update: VaultKeyUpdate,
  members: Map<string, VaultMember[]>,
): Promise<boolean> {
  const { vaultId, sender } = update;
  if (await deps.vault.isPeerRemoved(vaultId, sender.userId)) return false;
  let listed = members.get(vaultId);
  if (!listed) {
    listed = await deps.trpc.vault.members.query({ vaultId });
    members.set(vaultId, listed);
  }
  const member = listed.find((m) => m.userId === sender.userId);
  return (
    member !== undefined &&
    member.status === "active" &&
    canManageVault(member.role) &&
    member.publicKey.publicKey === sender.publicKey &&
    member.publicKey.keyVersion === sender.keyVersion
  );
}

/**
 * Carry out what a pull asked for: accept the newer keys sealed to this user
 * (from a current owner or manager whose key matches its pin, checked down the
 * chain to the held key), and rotate the vaults that lost a member. A task
 * that fails is logged and left for the next session; a lost connection or
 * session ends the tasks (rethrown) without counting against them. Resolves
 * whether anything changed on the server: the caller syncs again.
 */
export async function runSharingTasks(
  deps: SharingDeps & { reloadVaultKeys: (vaults: readonly MemberVault[]) => void },
  tasks: SharingTasks,
): Promise<boolean> {
  const failed = failedTasksOf(deps.vault);
  const members = new Map<string, VaultMember[]>();
  let changed = false;
  for (const update of tasks.keyUpdates) {
    const task = `${update.vaultId}/${update.keyVersion}`;
    if (failed.has(task)) continue;
    try {
      if (!(await trustedSender(deps, update, members))) throw new UntrustedKeySenderError();
      await checkPeerKey(deps.vault, update.sender.userId, update.sender);
      const wrap = await secretsStore.openKeyUpdate(update);
      await deps.trpc.vault.acceptKey.mutate(wrap);
      changed = true;
    } catch (error) {
      if (isRequestFailure(error)) throw error;
      // Resealed meanwhile: the next pull brings the newer key.
      if (isConflict(error)) {
        changed = true;
        continue;
      }
      failed.add(task);
      console.error(`The new key of vault ${update.vaultId} can't be accepted`, error);
    }
  }

  const vaults = new Map((await deps.vault.getVaults()).map((v) => [v.vaultId, v]));
  for (const vaultId of tasks.rotationsDue) {
    const vault = vaults.get(vaultId);
    if (!vault) continue;
    const task = `${vaultId}/${vault.keyVersion}`;
    if (failed.has(task)) continue;
    try {
      await rotateVault(deps, vaultId);
      // The push of the next round re-encrypts the records under the new key.
      deps.reloadVaultKeys(await deps.vault.getVaults());
      changed = true;
    } catch (error) {
      // Another manager rotated first: nothing left to do.
      if (error instanceof VaultKeyRotatedElsewhereError) {
        changed = true;
        continue;
      }
      if (isRequestFailure(error)) throw error;
      failed.add(task);
      console.error(`Vault ${vaultId} needs a key rotation, which failed`, error);
    }
  }
  return changed;
}

/** Forget the profile's failed tasks (e.g. after the user verified a changed key). */
export function resetSharingTasks(vault: Vault): void {
  failedTasks.delete(vault);
}
