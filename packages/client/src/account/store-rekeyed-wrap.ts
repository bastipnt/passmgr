import type { AccountKeyMaterial, MemberVault } from "@repo/schema";
import { logError } from "@repo/util";
import { rekeyIfBelowFloor } from "./rekey-password-keys";

type AccountStore = {
  saveAccount: (
    profileId: string,
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[] | null,
  ) => Promise<void>;
};

/**
 * After a login: `rekeyIfBelowFloor`, and the new wrap stored on the profile it was made for.
 * Best-effort, never throws: the next login tries again.
 */
export async function storeRekeyedWrap(
  trpc: Parameters<typeof rekeyIfBelowFloor>[0],
  store: AccountStore,
  profileId: string,
  password: string,
  material: AccountKeyMaterial,
): Promise<void> {
  try {
    const rekeyed = await rekeyIfBelowFloor(trpc, password, material);
    // Not the login's vault list: a sync may have moved a vault's key on meanwhile.
    if (rekeyed) await store.saveAccount(profileId, rekeyed, null);
  } catch (e) {
    logError("Storing the rekeyed password wrap failed", e);
  }
}
