import { PREF_KEYS, usePreference } from "@repo/client";
import { toast } from "@repo/ui";
import { useCallback } from "react";

/** `0` disables clearing. */
export const CLIPBOARD_CLEAR_DEFAULT_SECONDS = 0;

let clearTimer: ReturnType<typeof setTimeout> | undefined;

export function copyField(value: string | undefined, label: string) {
  if (!value) return;
  void navigator.clipboard.writeText(value);
  toast.success(`${label} copied to clipboard`);
}

/**
 * `copyField` plus the user's clipboard auto-clear preference. The clear is
 * best-effort: `writeText` needs document focus, so it silently does nothing if
 * the tab has been left in the meantime.
 */
export function useCopyField() {
  const [clearSeconds] = usePreference<number>(
    PREF_KEYS.clipboardClearSeconds,
    CLIPBOARD_CLEAR_DEFAULT_SECONDS,
  );

  return useCallback(
    (value: string | undefined, label: string) => {
      if (!value) return;
      copyField(value, label);

      clearTimeout(clearTimer);
      if (clearSeconds <= 0) return;

      clearTimer = setTimeout(() => {
        void navigator.clipboard.writeText("").catch(() => {
          // Tab lost focus — the clipboard stays as it is.
        });
      }, clearSeconds * 1_000);
    },
    [clearSeconds],
  );
}
