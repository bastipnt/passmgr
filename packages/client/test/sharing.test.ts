import {
  createUserKeyPair,
  getPasswordKekParams,
  rotateVaultKey,
  sealVaultKey,
  setPasswordKekParams,
  unwrapUserPrivateKey,
  unwrapVaultKey,
} from "@repo/crypto";
import type { MemberVault, RecordData, VaultKeyUpdate } from "@repo/schema";
import { secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { TRPCClientError } from "@trpc/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { RecordRepository } from "../src/records/record-repository";
import { decryptRecord } from "../src/util/decrypt-record";
import { copyRevokedRecords, getRevokedVaults } from "../src/vaults/revoked";
import { runSharingTasks, type SharingDeps } from "../src/vaults/sharing";

// The client side of sharing (ADR 0001 D7): what a pull's sharing tasks do,
// and rescuing unsent changes from a vault the user lost.

const SELF = "0199a3c4-0000-7000-8000-000000000001";
const ALICE = "0199a3c4-0000-7000-8000-000000000002";

let local: Awaited<ReturnType<typeof generateLocalVault>>;
let work: MemberVault;
let vault: Vault;

/** Another user with a keypair. */
function otherUser() {
  const accountKey = crypto.getRandomValues(new Uint8Array(32));
  const keyPair = createUserKeyPair(accountKey);
  return { keyPair, privateKey: unwrapUserPrivateKey(accountKey, keyPair) };
}

const previousParams = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  local = await generateLocalVault("pw");
  secretsStore.unlockWithAccountKey(local.accountKey);
  secretsStore.loadUserKeyPair(local.material.userKeyPair);
  work = { ...secretsStore.createVault({ name: "Team" }), kind: "shared", role: "manage" };
});
afterAll(() => {
  secretsStore.lock();
  setPasswordKekParams(previousParams);
});

beforeEach(async () => {
  secretsStore.loadVaultKeys([...local.vaults, work]);
  vault = new Vault(createTestDriver());
  await vault.setAccountKeyMaterial(local.material, [...local.vaults, work], {
    profileId: "p-1",
    mode: "linked",
    email: "me@example.com",
    userId: SELF,
  });
});
afterEach(async () => {
  await vault.destroy();
});

function fakeTrpc(members: unknown[] = []) {
  return {
    vault: {
      acceptKey: { mutate: vi.fn(async () => undefined) },
      rotateKey: { mutate: vi.fn(async () => undefined) },
      members: { query: vi.fn(async () => members) },
    },
  };
}

function deps(trpc: ReturnType<typeof fakeTrpc>) {
  return {
    vault,
    trpc: trpc as unknown as SharingDeps["trpc"],
    reloadVaultKeys: vi.fn((vaults: readonly MemberVault[]) => {
      secretsStore.loadVaultKeys(vaults);
    }),
  };
}

/** Alice rotates the team vault and seals the new key to this user, as the server hands it out. */
async function rotatedByAlice(alice = otherUser(), sealer = alice) {
  const aliceAccountKey = crypto.getRandomValues(new Uint8Array(32));
  const currentKey = unwrapVaultKey(local.accountKey, work);
  const next = rotateVaultKey(aliceAccountKey, currentKey, work.vaultId, 1, { name: "Team" });
  const newKey = unwrapVaultKey(aliceAccountKey, next);
  const update: VaultKeyUpdate = {
    vaultId: work.vaultId,
    keyVersion: 2,
    recipientKeyVersion: 1,
    sealedVaultKey: await sealVaultKey(
      sealer.privateKey,
      local.material.userKeyPair.publicKey,
      newKey,
      work.vaultId,
      2,
    ),
    sender: { userId: ALICE, ...alice.keyPair },
    links: [next.previousKey],
  };
  return { update, newKey, alice };
}

/** The server's member list with Alice as an active manager holding `key`. */
function aliceManages(key: { keyVersion: number; publicKey: string }, role = "manage") {
  return [{ userId: ALICE, role, status: "active", publicKey: key }];
}

describe("runSharingTasks", () => {
  it("accepts a newer key sealed by a member, pinning their key", async () => {
    const alice = otherUser();
    const trpc = fakeTrpc(aliceManages(alice.keyPair));
    const { update, newKey } = await rotatedByAlice(alice);

    expect(await runSharingTasks(deps(trpc), { keyUpdates: [update], rotationsDue: [] })).toBe(
      true,
    );

    const [wrap] = trpc.vault.acceptKey.mutate.mock.calls[0] as unknown as [MemberVault];
    expect(wrap).toMatchObject({ vaultId: work.vaultId, keyVersion: 2 });
    expect(unwrapVaultKey(local.accountKey, wrap)).toEqual(newKey);
    expect(await vault.getPeerKey(ALICE)).toEqual({
      keyVersion: 1,
      publicKey: alice.keyPair.publicKey,
    });
  });

  it("refuses a key from a sender whose key differs from the pinned one", async () => {
    const alice = otherUser();
    const trpc = fakeTrpc(aliceManages(alice.keyPair));
    // A server pairing Alice's name with its own keypair.
    await vault.pinPeerKey(ALICE, otherUser().keyPair);
    const { update } = await rotatedByAlice(alice);

    expect(await runSharingTasks(deps(trpc), { keyUpdates: [update], rotationsDue: [] })).toBe(
      false,
    );
    expect(trpc.vault.acceptKey.mutate).not.toHaveBeenCalled();
  });

  it("refuses a key not sealed by the named sender", async () => {
    const alice = otherUser();
    const trpc = fakeTrpc(aliceManages(alice.keyPair));
    const { update } = await rotatedByAlice(alice, otherUser());

    expect(await runSharingTasks(deps(trpc), { keyUpdates: [update], rotationsDue: [] })).toBe(
      false,
    );
    expect(trpc.vault.acceptKey.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["isn't listed as a member", () => []],
    [
      "is only a writer",
      (key: { keyVersion: number; publicKey: string }) => aliceManages(key, "write"),
    ],
    [
      "is listed with another key",
      () => aliceManages({ keyVersion: 1, publicKey: otherUser().keyPair.publicKey }),
    ],
  ])("refuses a key from a sender who %s", async (_label, listing) => {
    const alice = otherUser();
    const trpc = fakeTrpc(listing(alice.keyPair));
    const { update } = await rotatedByAlice(alice);

    expect(await runSharingTasks(deps(trpc), { keyUpdates: [update], rotationsDue: [] })).toBe(
      false,
    );
    expect(trpc.vault.acceptKey.mutate).not.toHaveBeenCalled();
  });

  it("refuses a key from a former member this device removed, even if the server lists them", async () => {
    // Alice was removed here: she knows key 1 and could chain a forged key 2 to it.
    const alice = otherUser();
    await vault.pinPeerKey(ALICE, alice.keyPair);
    await vault.markPeerRemoved(work.vaultId, ALICE);
    const trpc = fakeTrpc(aliceManages(alice.keyPair));
    const { update } = await rotatedByAlice(alice);

    expect(await runSharingTasks(deps(trpc), { keyUpdates: [update], rotationsDue: [] })).toBe(
      false,
    );
    expect(trpc.vault.acceptKey.mutate).not.toHaveBeenCalled();
  });

  it("ends the tasks on a request that didn't get through, without counting it as failed", async () => {
    const alice = otherUser();
    const trpc = fakeTrpc(aliceManages(alice.keyPair));
    trpc.vault.acceptKey.mutate.mockRejectedValueOnce(new TRPCClientError("fetch failed"));
    const { update } = await rotatedByAlice(alice);
    const d = deps(trpc);

    await expect(runSharingTasks(d, { keyUpdates: [update], rotationsDue: [] })).rejects.toThrow(
      "fetch failed",
    );
    // Tried again on the next round.
    expect(await runSharingTasks(d, { keyUpdates: [update], rotationsDue: [] })).toBe(true);
  });

  it("rotates a vault that lost a member, sealing the new key to the members left", async () => {
    const bob = otherUser();
    const trpc = fakeTrpc([
      {
        userId: SELF,
        publicKey: { keyVersion: 1, publicKey: local.material.userKeyPair.publicKey },
      },
      { userId: ALICE, publicKey: bob.keyPair },
    ]);
    const d = deps(trpc);

    expect(await runSharingTasks(d, { keyUpdates: [], rotationsDue: [work.vaultId] })).toBe(true);

    const [input] = trpc.vault.rotateKey.mutate.mock.calls[0] as unknown as [
      { keyVersion: number; memberKeys: { userId: string }[]; senderKeyVersion: number },
    ];
    expect(input).toMatchObject({ keyVersion: 2, senderKeyVersion: 1 });
    expect(input.memberKeys.map((m) => m.userId)).toEqual([ALICE]);
    expect((await vault.getVaults()).find((v) => v.vaultId === work.vaultId)?.keyVersion).toBe(2);
    expect(await vault.getRekeyTargets()).toEqual({ [work.vaultId]: 2 });
    expect(d.reloadVaultKeys).toHaveBeenCalled();
    expect(secretsStore.currentKeyVersion(work.vaultId)).toBe(2);
  });
});

describe("revoked vaults", () => {
  const login = (title: string) => ({ type: "login", title }) as RecordData;

  it("keeps the unsent edits of a lost vault and copies them into the personal vault", async () => {
    const records = new RecordRepository(vault);
    await records.create(login("Shared login"), work.vaultId);
    // The next pull no longer lists the vault: access was revoked.
    await vault.applySync({
      records: [],
      vaults: local.vaults,
      cursors: {},
      serverTimestamp: new Date().toISOString(),
    });
    expect(await records.getAll(work.vaultId)).toEqual([]);

    const [revoked] = await getRevokedVaults(vault);
    expect(revoked).toMatchObject({
      vaultId: work.vaultId,
      name: "Team",
      unreadable: 0,
      records: [{ payload: expect.objectContaining({ title: "Shared login" }) }],
    });

    expect(await copyRevokedRecords({ vault }, work.vaultId)).toBe(1);
    const copied = await records.getAll(local.vaults[0]!.vaultId);
    expect(copied.map((row) => (decryptRecord(row) as { title: string }).title)).toEqual([
      "Shared login",
    ]);
    expect(await getRevokedVaults(vault)).toEqual([]);
    // Queued for the server like any new record.
    expect(await vault.countPendingChanges()).toBe(1);
  });

  it("refuses to copy into a vault the user can't write to", async () => {
    const records = new RecordRepository(vault);
    await records.create(login("Shared login"), work.vaultId);
    const readOnly: MemberVault = { ...work, vaultId: crypto.randomUUID(), role: "read" };
    await vault.applySync({
      records: [],
      vaults: [...local.vaults, readOnly],
      cursors: {},
      serverTimestamp: new Date().toISOString(),
    });

    await expect(copyRevokedRecords({ vault }, work.vaultId, readOnly.vaultId)).rejects.toThrow(
      "vault you can edit",
    );
    // Still kept for another try.
    expect(await getRevokedVaults(vault)).toHaveLength(1);
  });
});
