import {
  createVault,
  openSealedVaultKey,
  rotateVaultKey,
  sealVaultKey,
  unwrapPreviousVaultKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
  wrapVaultKey,
} from "@repo/crypto";
import { db, vaultsTable } from "@repo/db";
import type { MemberVault, PushChange, VaultInvitation, VaultRole } from "@repo/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, loginAndGetAuthKey, putChange, register } from "./_helpers";

// Sharing a vault between accounts (ADR 0001 D7): invites sealed to the
// invitee's public key, accepting, roles, removal / leaving and the rotation
// that follows, key updates for the members who stay.

type User = Awaited<ReturnType<typeof loginAndGetAuthKey>> & {
  email: string;
  userId: string;
  accountKey: Uint8Array;
  privateKey: Uint8Array;
  personalVaultId: string;
};

async function signUp(email: string): Promise<User> {
  const { accountKey } = await register(email, "pw");
  const session = await loginAndGetAuthKey(email, "pw");
  const personalVaultId = session.vaultKeys[0]!.vaultId;
  const [vault] = await db
    .select({ ownerId: vaultsTable.ownerId })
    .from(vaultsTable)
    .where(eq(vaultsTable.vaultId, personalVaultId));
  return {
    ...session,
    email,
    userId: vault!.ownerId,
    accountKey,
    privateKey: unwrapUserPrivateKey(accountKey, session.userKeyPair),
    personalVaultId,
  };
}

/** A signed caller for one procedure (the signature covers its path and input). */
async function call(user: User, type: "mutation" | "query", path: string, input?: unknown) {
  return await callSigned(
    user.sessionId,
    user.authKey,
    type,
    path,
    input as Record<string, unknown> | string | undefined,
  );
}

const api = {
  sync: async (user: User) => {
    const input = { cursors: {} };
    return await (await call(user, "query", "record.sync", input)).record.sync(input);
  },
  push: async (user: User, ...changes: PushChange[]) => {
    const input = { changes };
    return (await (await call(user, "mutation", "record.push", input)).record.push(input)).results;
  },
  invitations: async (user: User) =>
    await (await call(user, "query", "vault.invitations")).vault.invitations(),
  members: async (user: User, vaultId: string) =>
    await (await call(user, "query", "vault.members", { vaultId })).vault.members({ vaultId }),
  mutate: async <K extends MutationName>(user: User, name: K, input: MutationInput<K>) => {
    const caller = await call(user, "mutation", `vault.${name}`, input);
    return await (caller.vault[name] as (input: MutationInput<K>) => Promise<unknown>)(input);
  },
};

type Caller = Awaited<ReturnType<typeof call>>;
type MutationName =
  | "create"
  | "invite"
  | "acceptKey"
  | "declineInvite"
  | "setMemberRole"
  | "removeMember"
  | "leave"
  | "transferOwnership"
  | "rotateKey";
type MutationInput<K extends MutationName> = Parameters<Caller["vault"][K]>[0];

async function createSharedVault(owner: User, name = "Team") {
  const vault = createVault(owner.accountKey, { name });
  await api.mutate(owner, "create", vault);
  return vault;
}

/** The owner's current wrap of a vault, from their sync. */
async function wrapOf(user: User, vaultId: string): Promise<MemberVault> {
  const vault = (await api.sync(user)).vaults.find((v) => v.vaultId === vaultId);
  if (!vault) throw new Error(`${user.email} isn't a member of ${vaultId}`);
  return vault;
}

/** Invite `invitee` into the vault the way the client does: its current key sealed to them. */
async function invite(inviter: User, vaultId: string, invitee: User, role: VaultRole) {
  const wrap = await wrapOf(inviter, vaultId);
  const vaultKey = unwrapVaultKey(inviter.accountKey, wrap);
  const input = {
    vaultId,
    email: invitee.email,
    role,
    keyVersion: wrap.keyVersion,
    recipientKeyVersion: invitee.userKeyPair.keyVersion,
    senderKeyVersion: inviter.userKeyPair.keyVersion,
    sealedVaultKey: await sealVaultKey(
      inviter.privateKey,
      invitee.userKeyPair.publicKey,
      vaultKey,
      vaultId,
      wrap.keyVersion,
    ),
  };
  await api.mutate(inviter, "invite", input);
  return input;
}

/** Open the invite to `vaultId` and accept it with a wrap under the invitee's account key. */
async function accept(invitee: User, vaultId: string): Promise<VaultInvitation> {
  const invitation = (await api.invitations(invitee)).find((i) => i.vaultId === vaultId);
  if (!invitation) throw new Error("no invitation");
  const vaultKey = await openSealedVaultKey(
    invitee.privateKey,
    invitation.sender.publicKey,
    invitation.sealedVaultKey,
    vaultId,
    invitation.keyVersion,
  );
  await api.mutate(
    invitee,
    "acceptKey",
    wrapVaultKey(invitee.accountKey, vaultKey, vaultId, invitation.keyVersion),
  );
  return invitation;
}

async function share(owner: User, vaultId: string, member: User, role: VaultRole) {
  await invite(owner, vaultId, member, role);
  await accept(member, vaultId);
}

/** Rotate the vault the way the client does: the new key sealed to every other member. */
async function rotate(user: User, vaultId: string, skip: string[] = []) {
  const wrap = await wrapOf(user, vaultId);
  const currentKey = unwrapVaultKey(user.accountKey, wrap);
  const rotated = rotateVaultKey(user.accountKey, currentKey, vaultId, wrap.keyVersion, {
    name: "Team",
  });
  const newKey = unwrapVaultKey(user.accountKey, rotated);
  const memberKeys = [];
  for (const member of await api.members(user, vaultId)) {
    if (member.userId === user.userId || skip.includes(member.userId)) continue;
    memberKeys.push({
      userId: member.userId,
      recipientKeyVersion: member.publicKey.keyVersion,
      sealedVaultKey: await sealVaultKey(
        user.privateKey,
        member.publicKey.publicKey,
        newKey,
        vaultId,
        rotated.keyVersion,
      ),
    });
  }
  const input = { ...rotated, senderKeyVersion: user.userKeyPair.keyVersion, memberKeys };
  await api.mutate(user, "rotateKey", input);
  return { newKey, oldKey: currentKey, keyVersion: rotated.keyVersion };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("invites", () => {
  it("an invitee opens the sealed key from the inviter and joins on accepting", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);

    await invite(alice, team.vaultId, bob, "write");

    // Pending: nothing to read or write yet.
    expect((await api.sync(bob)).vaults.map((v) => v.vaultId)).toEqual([bob.personalVaultId]);
    expect(await api.push(bob, putChange(team.vaultId))).toMatchObject([
      { status: "rejected", reason: "not_found" },
    ]);
    expect(await api.members(alice, team.vaultId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: alice.userId, role: "owner", status: "active" }),
        expect.objectContaining({
          userId: bob.userId,
          email: "bob@example.com",
          role: "write",
          status: "pending",
          publicKey: { keyVersion: 1, publicKey: bob.userKeyPair.publicKey },
        }),
      ]),
    );

    const invitation = await accept(bob, team.vaultId);
    expect(invitation).toMatchObject({
      role: "write",
      keyVersion: 1,
      sender: {
        userId: alice.userId,
        email: "alice@example.com",
        publicKey: alice.userKeyPair.publicKey,
      },
    });

    const joined = await wrapOf(bob, team.vaultId);
    expect(joined).toMatchObject({ kind: "shared", role: "write", keyVersion: 1 });
    expect(unwrapVaultKey(bob.accountKey, joined)).toEqual(unwrapVaultKey(alice.accountKey, team));
    expect(await api.invitations(bob)).toEqual([]);
    expect(await api.push(bob, putChange(team.vaultId))).toMatchObject([{ status: "applied" }]);
  });

  it("only owners and managers invite, never above their own role, never into a personal vault", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");

    await expect(invite(bob, team.vaultId, carol, "read")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await api.mutate(alice, "setMemberRole", {
      vaultId: team.vaultId,
      userId: bob.userId,
      role: "manage",
    });
    await expect(invite(bob, team.vaultId, carol, "owner")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await invite(bob, team.vaultId, carol, "manage");

    await expect(invite(alice, alice.personalVaultId, carol, "read")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses an unknown email, a second invite and a key the vault has rotated away from", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    const ghost = { ...bob, email: "ghost@example.com" };

    await expect(invite(alice, team.vaultId, ghost, "read")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const sealed = await invite(alice, team.vaultId, bob, "read");
    await expect(invite(alice, team.vaultId, bob, "read")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await api.mutate(alice, "removeMember", { vaultId: team.vaultId, userId: bob.userId });
    await rotate(alice, team.vaultId);
    // Sealed under key 1, which the vault left.
    await expect(api.mutate(alice, "invite", sealed)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      api.mutate(alice, "invite", { ...sealed, keyVersion: 2, recipientKeyVersion: 2 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("an invite forged with another keypair doesn't open as the inviter's", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const mallory = await signUp("mallory@example.com");
    const team = await createSharedVault(alice);
    await invite(alice, team.vaultId, bob, "read");
    const invitation = (await api.invitations(bob))[0]!;

    // Sealed by Mallory but claimed to be from Alice.
    const forged = await sealVaultKey(
      mallory.privateKey,
      bob.userKeyPair.publicKey,
      crypto.getRandomValues(new Uint8Array(32)),
      team.vaultId,
      1,
    );
    await expect(
      openSealedVaultKey(bob.privateKey, invitation.sender.publicKey, forged, team.vaultId, 1),
    ).rejects.toThrow();
  });

  it("declining drops the invite and marks the vault for a rotation", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await invite(alice, team.vaultId, bob, "read");

    await api.mutate(bob, "declineInvite", { vaultId: team.vaultId });

    expect(await api.invitations(bob)).toEqual([]);
    expect((await api.members(alice, team.vaultId)).map((m) => m.userId)).toEqual([alice.userId]);
    expect((await api.sync(alice)).rotationsDue).toEqual([team.vaultId]);
    await rotate(alice, team.vaultId);
    expect((await api.sync(alice)).rotationsDue).toEqual([]);
  });
});

describe("rotation with members", () => {
  it("seals the new key to every member, who opens it down the chain and accepts it", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");
    await invite(alice, team.vaultId, carol, "read");

    // Missing Bob's (or Carol's) copy: the member list moved on, fetch it again.
    await expect(rotate(alice, team.vaultId, [bob.userId])).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    const { newKey, oldKey } = await rotate(alice, team.vaultId);

    const { keyUpdates, vaults } = await api.sync(bob);
    // Bob still holds key 1 until he accepts key 2.
    expect(vaults.find((v) => v.vaultId === team.vaultId)?.keyVersion).toBe(1);
    expect(keyUpdates).toHaveLength(1);
    const update = keyUpdates[0]!;
    expect(update).toMatchObject({
      vaultId: team.vaultId,
      keyVersion: 2,
      sender: { userId: alice.userId, publicKey: alice.userKeyPair.publicKey },
    });
    const opened = await openSealedVaultKey(
      bob.privateKey,
      update.sender.publicKey,
      update.sealedVaultKey,
      team.vaultId,
      2,
    );
    expect(opened).toEqual(newKey);
    expect(update.links.map((l) => l.keyVersion)).toEqual([1]);
    expect(unwrapPreviousVaultKey(opened, team.vaultId, update.links[0]!)).toEqual(oldKey);

    // Puts under key 1 are refused; after accepting, Bob writes under key 2.
    expect(await api.push(bob, putChange(team.vaultId))).toMatchObject([
      { status: "rejected", reason: "key_version" },
    ]);
    await api.mutate(bob, "acceptKey", wrapVaultKey(bob.accountKey, opened, team.vaultId, 2));
    const accepted = await api.sync(bob);
    expect(accepted.keyUpdates).toEqual([]);
    expect(accepted.vaults.find((v) => v.vaultId === team.vaultId)).toMatchObject({
      keyVersion: 2,
      previousKeys: [expect.objectContaining({ keyVersion: 1 })],
    });
    expect(await api.push(bob, putChange(team.vaultId, { keyVersion: 2 }))).toMatchObject([
      { status: "applied" },
    ]);

    // Carol's invite now carries key 2.
    const invitation = await accept(carol, team.vaultId);
    expect(invitation.keyVersion).toBe(2);
  });

  it("accepting a key that was resealed since answers CONFLICT", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");
    const first = await rotate(alice, team.vaultId);
    await rotate(alice, team.vaultId);

    await expect(
      api.mutate(bob, "acceptKey", wrapVaultKey(bob.accountKey, first.newKey, team.vaultId, 2)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [update] = (await api.sync(bob)).keyUpdates;
    expect(update).toMatchObject({ keyVersion: 3 });
    expect(update!.links.map((l) => l.keyVersion)).toEqual([1, 2]);
  });

  it("acceptKey without a key sealed to the caller answers CONFLICT and changes nothing", async () => {
    const alice = await signUp("alice@example.com");
    const team = await createSharedVault(alice);
    const wrap = await wrapOf(alice, team.vaultId);

    await expect(
      api.mutate(alice, "acceptKey", {
        vaultId: team.vaultId,
        keyVersion: 1,
        encryptedVaultKey: wrap.encryptedVaultKey,
        vaultKeyEncryptionNonce: wrap.vaultKeyEncryptionNonce,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses seals that name someone outside the vault in place of a member", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const mallory = await signUp("mallory@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");
    const wrap = await wrapOf(alice, team.vaultId);
    const currentKey = unwrapVaultKey(alice.accountKey, wrap);
    const rotated = rotateVaultKey(alice.accountKey, currentKey, team.vaultId, 1, { name: "T" });
    const seal = {
      userId: mallory.userId,
      recipientKeyVersion: 1,
      sealedVaultKey: await sealVaultKey(
        alice.privateKey,
        mallory.userKeyPair.publicKey,
        unwrapVaultKey(alice.accountKey, rotated),
        team.vaultId,
        2,
      ),
    };

    await expect(
      api.mutate(alice, "rotateKey", { ...rotated, senderKeyVersion: 1, memberKeys: [seal] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("a manager who hasn't accepted the current key can't rotate from it", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "manage");
    await rotate(alice, team.vaultId);

    // Bob's wrap is still at key 1: his link would chain the wrong key.
    await expect(rotate(bob, team.vaultId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("members and roles", () => {
  it("a manager can't touch owners; the last owner can't be demoted", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "manage");
    await share(alice, team.vaultId, carol, "read");
    const roleOf = async (userId: string) =>
      (await api.members(alice, team.vaultId)).find((m) => m.userId === userId)?.role;
    const setRole = (user: User, userId: string, role: VaultRole) =>
      api.mutate(user, "setMemberRole", { vaultId: team.vaultId, userId, role });

    await setRole(bob, carol.userId, "write");
    expect(await roleOf(carol.userId)).toBe("write");
    await expect(setRole(bob, carol.userId, "owner")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRole(bob, alice.userId, "read")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRole(carol, bob.userId, "read")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRole(alice, alice.userId, "manage")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    // A second owner, then the first may step down.
    await setRole(alice, bob.userId, "owner");
    await setRole(alice, alice.userId, "manage");
    expect(await roleOf(alice.userId)).toBe("manage");
  });

  it("removing a member ends their access and marks the vault for a rotation", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "manage");
    await share(alice, team.vaultId, carol, "write");

    await expect(
      api.mutate(bob, "removeMember", { vaultId: team.vaultId, userId: alice.userId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await api.mutate(bob, "removeMember", { vaultId: team.vaultId, userId: carol.userId });

    expect((await api.sync(carol)).vaults.map((v) => v.vaultId)).toEqual([carol.personalVaultId]);
    // Revoked while offline: Carol's queued edit is refused.
    expect(await api.push(carol, putChange(team.vaultId))).toMatchObject([
      { status: "rejected", reason: "not_found" },
    ]);
    // Every manager holding the key sees the rotation due; one does it.
    expect((await api.sync(alice)).rotationsDue).toEqual([team.vaultId]);
    expect((await api.sync(bob)).rotationsDue).toEqual([team.vaultId]);
    await rotate(bob, team.vaultId);
    expect((await api.sync(alice)).rotationsDue).toEqual([]);
    expect((await api.sync(alice)).keyUpdates).toMatchObject([
      { vaultId: team.vaultId, keyVersion: 2, sender: { userId: bob.userId } },
    ]);
  });

  it("the last owner can't leave; a member can, which marks the vault for a rotation", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");

    await expect(api.mutate(alice, "leave", { vaultId: team.vaultId })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(
      api.mutate(alice, "leave", { vaultId: alice.personalVaultId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await api.mutate(bob, "leave", { vaultId: team.vaultId });
    expect((await api.sync(bob)).vaults.map((v) => v.vaultId)).toEqual([bob.personalVaultId]);
    expect((await api.sync(alice)).rotationsDue).toEqual([team.vaultId]);
  });

  it("ownership moves to an active member, after which the old owner may leave", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");
    await invite(alice, team.vaultId, carol, "read");

    await expect(
      api.mutate(alice, "transferOwnership", { vaultId: team.vaultId, userId: carol.userId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      api.mutate(bob, "transferOwnership", { vaultId: team.vaultId, userId: bob.userId }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await api.mutate(alice, "transferOwnership", { vaultId: team.vaultId, userId: bob.userId });

    const roles = Object.fromEntries(
      (await api.members(bob, team.vaultId)).map((m) => [m.userId, m.role]),
    );
    expect(roles).toMatchObject({ [alice.userId]: "manage", [bob.userId]: "owner" });
    const [vault] = await db
      .select({ ownerId: vaultsTable.ownerId })
      .from(vaultsTable)
      .where(eq(vaultsTable.vaultId, team.vaultId));
    expect(vault?.ownerId).toBe(bob.userId);
    await api.mutate(alice, "leave", { vaultId: team.vaultId });
  });

  it("members of other vaults can't list or change this one's members", async () => {
    const alice = await signUp("alice@example.com");
    const mallory = await signUp("mallory@example.com");
    const team = await createSharedVault(alice);

    await expect(api.members(mallory, team.vaultId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api.mutate(mallory, "removeMember", { vaultId: team.vaultId, userId: alice.userId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("two members editing", () => {
  it("concurrent edits of one record: one applies, the other is stale, then merges on top", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "write");
    const [created] = await api.push(alice, putChange(team.vaultId));
    const recordId = created?.status === "applied" ? created.record.recordId : "";

    const [a, b] = await Promise.all([
      api.push(alice, putChange(team.vaultId, { recordId, baseVersion: 1, data: "A" })),
      api.push(bob, putChange(team.vaultId, { recordId, baseVersion: 1, data: "B" })),
    ]);
    const statuses = [a[0]?.status, b[0]?.status].sort();
    expect(statuses).toEqual(["applied", "stale"]);

    const loser = a[0]?.status === "stale" ? alice : bob;
    expect(
      await api.push(loser, putChange(team.vaultId, { recordId, baseVersion: 2, data: "AB" })),
    ).toMatchObject([{ status: "applied", record: { version: 3 } }]);
  });

  it("one member's writes reach the other member's pull", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await share(alice, team.vaultId, bob, "read");

    await api.push(alice, putChange(team.vaultId, { data: "shared" }));

    const pulled = await api.sync(bob);
    expect(pulled.records.filter((r) => r.vaultId === team.vaultId)).toMatchObject([
      { encryptedData: "shared" },
    ]);
  });
});
