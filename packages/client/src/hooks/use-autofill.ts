import { PASSWORD_DEFAULTS } from "@repo/crypto";
import {
  type AutofillState,
  autofillState,
  clearAutofillEntries,
  openAutofillSettings,
  secretsStore,
  writeAutofillEntries,
} from "@repo/store";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { autofillEntries, importPendingAutofillLogins } from "../records/autofill";
import { profileLabel } from "../util/profile-label";
import { useGeneratorDefaults } from "./use-generator-defaults";

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
 * foreground. The native "Create login" form generates with the password generator defaults.
 */
export function useAutofillSync(appActive: boolean) {
  const { records, ready, revision } = useRecordsContext();
  const { vaultUnlocked } = useContext(SessionContext);
  const store = useStore();
  const { state } = useAutofillState(appActive);
  const { pwOpts } = useGeneratorDefaults();
  // A preference saved by an older version may lack a key; iOS decodes the options strictly.
  const generator = useMemo(() => ({ ...PASSWORD_DEFAULTS, ...pwOpts }), [pwOpts]);
  usePendingAutofillLogins(appActive);

  // `records` is a new array on every render; `revision` says when its content changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => autofillEntries(records), [revision]);

  useEffect(() => {
    const entry = store.current()?.entry;
    if (!entry || !vaultUnlocked || !ready || !state) return;
    const write =
      state === "enabled"
        ? writeAutofillEntries(entry.profileId, profileLabel(entry), entries, generator)
        : clearAutofillEntries(entry.profileId);
    write.catch((e: unknown) => console.error("Autofill entries not updated", e));
  }, [store, vaultUnlocked, ready, state, entries, generator]);
}

/**
 * Saves the logins created in the OS autofill while the app was away into the personal vault,
 * whenever the unlocked app comes to the foreground. Reading them asks for biometrics: once
 * that is cancelled or fails, they wait for the next unlock instead of asking every time.
 */
function usePendingAutofillLogins(appActive: boolean) {
  const { ready, reload } = useRecordsContext();
  const { vaultUnlocked } = useContext(SessionContext);
  const store = useStore();
  const running = useRef(false);
  const failed = useRef(false);

  useEffect(() => {
    const active = store.current();
    const vaultId = secretsStore.defaultVaultId;
    if (!active || !vaultId || !vaultUnlocked || !ready || !appActive) return;
    if (running.current || failed.current) return;
    running.current = true;
    importPendingAutofillLogins(active.records, active.entry.profileId, vaultId)
      .then((written) => (written > 0 ? reload() : undefined))
      .catch((e: unknown) => {
        failed.current = true;
        console.error("Logins created in autofill not saved", e);
      })
      .finally(() => {
        running.current = false;
      });
  }, [store, vaultUnlocked, ready, appActive, reload]);
}
