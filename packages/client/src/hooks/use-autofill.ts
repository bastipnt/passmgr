import {
  type AutofillState,
  autofillState,
  clearAutofillEntries,
  openAutofillSettings,
  writeAutofillEntries,
} from "@repo/store";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { autofillEntries } from "../records/autofill";
import { profileLabel } from "../util/profile-label";

/** Whether the OS uses this app for autofill; `null` while asking. Re-asks when `appActive` turns true. */
export function useAutofillState(appActive: boolean) {
  const [state, setState] = useState<AutofillState | null>(null);

  const refresh = useCallback(async () => setState(await autofillState()), []);

  useEffect(() => {
    if (appActive) void refresh();
  }, [appActive, refresh]);

  return { state, openSettings: openAutofillSettings };
}

/**
 * Keeps the open profile's autofill entries current (mobile, mounted once in the unlocked tree).
 * Written only while the OS has autofill on for this app: the entries are another copy of the
 * passwords on the device, so with it off they're dropped, once the profile is open in the
 * foreground.
 */
export function useAutofillSync(appActive: boolean) {
  const { records, ready, revision } = useRecordsContext();
  const { vaultUnlocked } = useContext(SessionContext);
  const store = useStore();
  const { state } = useAutofillState(appActive);

  // `records` is a new array on every render; `revision` says when its content changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => autofillEntries(records), [revision]);

  useEffect(() => {
    const entry = store.current()?.entry;
    if (!entry || !vaultUnlocked || !ready || !state) return;
    const write =
      state === "enabled"
        ? writeAutofillEntries(entry.profileId, profileLabel(entry), entries)
        : clearAutofillEntries(entry.profileId);
    write.catch((e: unknown) => console.error("Autofill entries not updated", e));
  }, [store, vaultUnlocked, ready, state, entries]);
}
