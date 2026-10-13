import type { AutofillEntry, AutofillState } from "./autofill.types";

export type { AutofillEntry, AutofillState };

/** Web has no OS autofill provider: every call is a no-op. Metro resolves `./autofill.native`. */
export async function autofillState(): Promise<AutofillState> {
  return "unavailable";
}

export async function openAutofillSettings(): Promise<boolean> {
  return false;
}

export async function writeAutofillEntries(
  _profileId: string,
  _profileLabel: string,
  _entries: readonly AutofillEntry[],
): Promise<void> {
  // no-op on web
}

/** For best-effort clears: the profile's other cleanup must still run. */
export function logAutofillClearError(error: unknown): void {
  console.error("Autofill entries not removed", error);
}

export async function clearAutofillEntries(_profileId: string): Promise<void> {
  // no-op on web
}
