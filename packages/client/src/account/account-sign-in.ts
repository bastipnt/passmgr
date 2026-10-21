import { normalizeEmail } from "@repo/crypto";
import type { VaultUnlockInfo } from "@repo/schema";
import type { ProfileEntry } from "@repo/store";
import type { SecondFactorPrompt } from "../login";
import { timed } from "../util/perf";

/** What `useStore`, `useUnlock` and `useLogin` hand the sign-in. */
export type AccountSignInSteps = {
  profiles: readonly ProfileEntry[];
  unlockByEmail: (
    email: string,
    password: string,
    prompt?: SecondFactorPrompt,
  ) => Promise<boolean | undefined>;
  loginUser: (
    email: string,
    password: string,
    prompt?: SecondFactorPrompt,
  ) => Promise<VaultUnlockInfo | undefined>;
  unlock: (info: VaultUnlockInfo) => Promise<boolean>;
};

/**
 * Email + password of an account (ADR 0001 D2): a profile on this device
 * unlocks as if picked, without the server; any other account logs in and
 * adds its profile. `onOpening(true)` comes right before a vault is about to
 * open, `onOpening(false)` when the device's copy didn't. Resolves whether a
 * vault opened.
 */
export async function signInToAccount(
  { profiles, unlockByEmail, loginUser, unlock }: AccountSignInSteps,
  email: string,
  password: string,
  prompt?: SecondFactorPrompt,
  onOpening?: (opening: boolean) => void,
): Promise<boolean> {
  const onDevice = profiles.some((p) => p.mode === "linked" && p.email === normalizeEmail(email));
  if (onDevice) onOpening?.(true);
  const unlocked = await timed("total unlock time", () => unlockByEmail(email, password, prompt));
  if (unlocked !== undefined) {
    if (!unlocked && onDevice) onOpening?.(false);
    return unlocked;
  }

  const unlockInfo = await timed("total login time", () => loginUser(email, password, prompt));
  if (!unlockInfo) return false;
  onOpening?.(true);
  return await timed("total unlock time", () => unlock(unlockInfo));
}
