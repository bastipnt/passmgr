import { wipe } from "@repo/crypto";
import { DEMO_PASSWORD, DEMO_VAULT_NAME, seedDemoVault } from "../account/demo-vault";
import { logError } from "../errors/log-error";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useCreateLocalVault } from "./use-create-local-vault";
import { useReloadRecords } from "./use-records";
import { useUnlock } from "./use-unlock";

/**
 * - `failed` / `unlock_failed`: as in `useCreateLocalVault`
 * - `seed_failed`: the demo vault is open, but writing its example records failed
 */
export type DemoVaultError = "failed" | "unlock_failed" | "seed_failed";

export const DEMO_VAULT_ERROR_MESSAGES: Record<DemoVaultError, string> = {
  failed: "The demo couldn't be prepared. Try again.",
  unlock_failed: "The demo vault was created but didn't open. Try again.",
  seed_failed: "The demo vault opened, but its example data couldn't be added.",
};

/**
 * The web demo build's vault: a `local` profile marked `demo`, under the known
 * `DEMO_PASSWORD`, filled with the demo seed. One per device: starting a new
 * demo removes the old one. Locked only (it switches profiles).
 */
export function useDemoVault() {
  const { createLocalVault, finishLocalVault } = useCreateLocalVault();
  const { unlockLocal } = useUnlock();
  const store = useStore();
  const reload = useReloadRecords();

  /** Resolves why the demo didn't start; nothing when it did (`seed_failed` leaves it open). */
  async function startDemo(): Promise<DemoVaultError | undefined> {
    const previous = store.profiles.filter((p) => p.demo);
    const recoveryKey = await createLocalVault(DEMO_PASSWORD, DEMO_VAULT_NAME, true);
    if (!recoveryKey) return "failed";
    // Nobody needs to recover a vault whose password is public.
    wipe(recoveryKey);
    // Only once the new one is active: the unlock screen never runs out of a demo to show.
    for (const { profileId } of previous) await store.removeProfile(profileId);
    if (!(await finishLocalVault())) return "unlock_failed";

    try {
      await seedDemoVault(requireActive(store));
    } catch (e) {
      logError("Seeding the demo vault failed", e);
      return "seed_failed";
    } finally {
      await reload().catch(() => undefined);
    }
  }

  const continueDemo = () => unlockLocal(DEMO_PASSWORD);

  return { startDemo, continueDemo };
}
