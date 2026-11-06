import { type DemoSeedRecord, demoSeed, type RecordData, SEED_VAULTS } from "@repo/schema";
import { secretsStore } from "@repo/store";
import type { ImportEntry } from "../export/import-export";
import { type ActiveProfile, reloadVaultKeys } from "../providers/StoreProvider";
import { monitoredPassword } from "../records/password-health";

/**
 * Known to everyone: a demo vault is a showcase, not a safe. The unlock screen
 * opens it with this password, no typing.
 */
export const DEMO_PASSWORD = "passmgr-demo";
export const DEMO_VAULT_NAME = "Demo vault";

const DAY_MS = 24 * 60 * 60 * 1000;

type SeedStep =
  | { daysAgo: number; kind: "write"; entry: ImportEntry }
  | { daysAgo: number; kind: "delete"; recordId: string };

/**
 * Fill the unlocked, freshly created demo profile: the seed vaults next to its
 * personal one, then every record version and trash entry, dated back so sort
 * orders, "old password" and the version history look lived in.
 */
export async function seedDemoVault(
  active: ActiveProfile,
  seed: readonly DemoSeedRecord[] = demoSeed(),
  now = Date.now(),
): Promise<void> {
  const vaultIds = await createSeedVaults(active);
  const steps = seed.flatMap((record) => seedSteps(record, vaultIds));
  const days = [...new Set(steps.map((step) => step.daysAgo))].sort((a, b) => b - a);

  for (const day of days) {
    const at = new Date(now - day * DAY_MS).toISOString();
    const due = steps.filter((step) => step.daysAgo === day);
    const writes = due.flatMap((step) => (step.kind === "write" ? [stamped(step.entry, at)] : []));
    await active.records.writeImport(writes, at);
    for (const step of due)
      if (step.kind === "delete") await active.records.delete(step.recordId, at);
  }
}

async function createSeedVaults(active: ActiveProfile): Promise<string[]> {
  const personal = secretsStore.defaultVaultId;
  if (!personal) throw new Error("The demo vault has no personal vault key");
  const vaultIds: string[] = [];
  for (const { kind, meta } of SEED_VAULTS) {
    if (kind === "personal") {
      vaultIds.push(personal);
      continue;
    }
    const created = secretsStore.createVault(meta);
    await active.vault.saveVault({ ...created, kind: "shared", role: "owner" });
    vaultIds.push(created.vaultId);
  }
  reloadVaultKeys(await active.vault.getVaults());
  return vaultIds;
}

function seedSteps(record: DemoSeedRecord, vaultIds: readonly string[]): SeedStep[] {
  const recordId = crypto.randomUUID();
  const vaultId = vaultIds[record.vault];
  if (!vaultId) throw new Error(`No seed vault ${record.vault}`);
  const steps: SeedStep[] = record.versions.map(({ data, daysAgo }, i) => ({
    daysAgo,
    kind: "write",
    entry: { kind: i === 0 ? "create" : "update", recordId, vaultId, data },
  }));
  if (record.deletedDaysAgo !== undefined)
    steps.push({ daysAgo: record.deletedDaysAgo, kind: "delete", recordId });
  return steps;
}

/** A password set in this version dates from it; an unchanged one keeps its date (`writeImport`). */
function stamped(entry: ImportEntry, at: string): ImportEntry {
  if (!monitoredPassword(entry.data)) return entry;
  return { ...entry, data: { ...entry.data, passwordChangedAt: at } as RecordData };
}
