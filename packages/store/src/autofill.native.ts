import type { PasswordOptions } from "@repo/crypto";
import { requireOptionalNativeModule } from "expo";
import type { AutofillEntry, AutofillState, PendingAutofillLogin } from "./autofill.types";

export type { AutofillEntry, AutofillState, PendingAutofillLogin };

/** `apps/mobile/modules/autofill`: encrypts what it's given to a biometric-gated device key. */
type PassmgrAutofillModule = {
  isEnabled(): Promise<boolean>;
  openSettings(): Promise<boolean>;
  /** `payloadJson`: `{ profileLabel, entries, generator }`, stored encrypted as is. */
  setEntries(profileId: string, payloadJson: string): Promise<void>;
  clearEntries(profileId: string): Promise<void>;
  /** No prompt: only whether the profile has any. */
  hasPending(profileId: string): Promise<boolean>;
  /** Behind the biometric prompt; a JSON array of `PendingAutofillLogin`. */
  readPending(profileId: string): Promise<string>;
  /** `ids` null: every one of the profile. */
  removePending(profileId: string, ids: string[] | null): Promise<void>;
};

const native = requireOptionalNativeModule<PassmgrAutofillModule>("PassmgrAutofill");

// One profile's writes and clears run in call order: a write still in flight when the
// profile signs out must not land after the clear and bring the passwords back.
const queues = new Map<string, Promise<void>>();

function queued(profileId: string, run: () => Promise<void>): Promise<void> {
  const next = (queues.get(profileId) ?? Promise.resolve()).then(run, run);
  queues.set(profileId, next);
  const done = () => {
    if (queues.get(profileId) === next) queues.delete(profileId);
  };
  next.then(done, done);
  return next;
}

export async function autofillState(): Promise<AutofillState> {
  if (!native) return "unavailable";
  return (await native.isEnabled()) ? "enabled" : "disabled";
}

/** Opens the OS screen that picks the autofill provider; false where the OS has no such link. */
export async function openAutofillSettings(): Promise<boolean> {
  return (await native?.openSettings()) ?? false;
}

export async function writeAutofillEntries(
  profileId: string,
  profileLabel: string,
  entries: readonly AutofillEntry[],
  generator: PasswordOptions,
): Promise<void> {
  if (!native) return;
  const payload = JSON.stringify({ profileLabel, entries, generator });
  await queued(profileId, () => native.setEntries(profileId, payload));
}

/** For best-effort clears: the profile's other cleanup must still run. */
export function logAutofillClearError(error: unknown): void {
  console.error("Autofill entries not removed", error);
}

export async function clearAutofillEntries(profileId: string): Promise<void> {
  if (!native) return;
  await queued(profileId, () => native.clearEntries(profileId));
}

export async function hasPendingAutofillLogins(profileId: string): Promise<boolean> {
  return (await native?.hasPending(profileId)) ?? false;
}

/** Asks for Face ID / Touch ID / the fingerprint: they're encrypted to the autofill device key. */
export async function readPendingAutofillLogins(
  profileId: string,
): Promise<PendingAutofillLogin[]> {
  if (!native) return [];
  return JSON.parse(await native.readPending(profileId)) as PendingAutofillLogin[];
}

/** The given ones, or all of the profile's. */
export async function removePendingAutofillLogins(
  profileId: string,
  ids?: readonly string[],
): Promise<void> {
  await native?.removePending(profileId, ids ? [...ids] : null);
}
