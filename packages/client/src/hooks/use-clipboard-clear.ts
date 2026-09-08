import { useCallback } from "react";
import { PREF_KEYS } from "../preferences/preference-keys";
import { CLIPBOARD_CLEAR_DEFAULT_SECONDS } from "../preferences/security-choices";
import { usePreference } from "./use-preference";

/** One pending clear at a time — a fresh copy replaces the previous timer. */
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Writes to the clipboard and, if the user asked for it, clears it again after
 * their chosen delay. The clear is best-effort: web needs document focus for
 * `writeText`, so it silently does nothing if the tab has been left meanwhile.
 *
 * `write` is the platform's clipboard call — `navigator.clipboard.writeText` on
 * web, `Clipboard.setString` on native.
 */
export function useCopyToClipboard(write: (text: string) => void | Promise<void>) {
  const [clearSeconds] = usePreference<number>(
    PREF_KEYS.clipboardClearSeconds,
    CLIPBOARD_CLEAR_DEFAULT_SECONDS,
  );

  return useCallback(
    (value: string | undefined) => {
      if (!value) return false;
      void write(value);

      clearTimeout(clearTimer);
      if (clearSeconds <= 0) return true;

      clearTimer = setTimeout(() => {
        void Promise.resolve(write("")).catch(() => {
          // Focus lost — the clipboard stays as it is.
        });
      }, clearSeconds * 1_000);

      return true;
    },
    [clearSeconds, write],
  );
}
