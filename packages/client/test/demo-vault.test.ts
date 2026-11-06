import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import { demoSeed, type RecordData, SEED_VAULTS } from "@repo/schema";
import { type ProfileEntry, secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { seedDemoVault } from "../src/account/demo-vault";
import type { ActiveProfile } from "../src/providers/StoreProvider";
import { RecordRepository } from "../src/records/record-repository";
import { decryptRecord } from "../src/util/decrypt-record";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-06T12:00:00.000Z");

let vault: Vault;
let active: ActiveProfile;

const previousParams = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previousParams));

beforeEach(async () => {
  const local = await generateLocalVault("pw");
  vault = new Vault(createTestDriver());
  await vault.createLocalVault(local.material, local.recovery, local.vaults, local.profile);
  secretsStore.unlockWithAccountKey(local.accountKey);
  secretsStore.loadVaultKeys(local.vaults);
  active = {
    entry: { profileId: local.profile.profileId, demo: true } as ProfileEntry,
    vault,
    records: new RecordRepository(vault),
  } as ActiveProfile;
});

afterEach(async () => {
  secretsStore.lock();
  await vault.destroy();
});

const decrypted = (row: Parameters<typeof decryptRecord>[0]) =>
  decryptRecord(row) as RecordData & { passwordChangedAt?: string; password?: string };

describe("seedDemoVault", () => {
  it("adds the seed vaults and every record, live ones listed, trashed ones in the trash", async () => {
    const seed = demoSeed();
    await seedDemoVault(active, seed, NOW);

    expect((await vault.getVaults()).length).toBe(SEED_VAULTS.length);
    const live = await active.records.getAll();
    const trashed = await active.records.getDeleted();
    expect(live.length + trashed.length).toBe(seed.length);
    expect(trashed.length).toBe(seed.filter((r) => r.deletedDaysAgo !== undefined).length);
    expect(new Set(live.map((r) => r.vaultId)).size).toBe(SEED_VAULTS.length);
  });

  it("dates versions back and keeps earlier passwords in the history", async () => {
    await seedDemoVault(active, demoSeed(), NOW);
    const rows = await active.records.getAll();
    const github = rows.find((r) => decrypted(r).title === "GitHub")!;

    const history = await active.records.history(github.recordId);
    expect(history.map((v) => decrypted(v).password)).toEqual([
      "vN7#qT2m!Rx9$kLw4Zp",
      "Gh!tHub-2022",
      "github2019",
    ]);
    expect(Date.parse(history.at(-1)!.created_at!)).toBe(NOW - 700 * DAY_MS);
    expect(decrypted(github).passwordChangedAt).toBe(new Date(NOW - 20 * DAY_MS).toISOString());
    expect(decrypted(github).favorite).toBe(true);
  });

  it("leaves passwords a year old or more, for Pass Monitor", async () => {
    await seedDemoVault(active, demoSeed(), NOW);
    const changed = (await active.records.getAll())
      .map((r) => decrypted(r).passwordChangedAt)
      .filter((at) => at !== undefined);
    expect(changed.some((at) => NOW - Date.parse(at) >= 365 * DAY_MS)).toBe(true);
  });
});
