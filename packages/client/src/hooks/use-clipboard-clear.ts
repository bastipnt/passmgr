import { useCallback } from "react";
import { CLIPBOARD_CLEAR_PREFERENCE } from "../preferences/security-choices";
import { useChoicePreference } from "./use-preference";

/** The platform's clipboard, as each app wires it (`apps/web/src/lib/clipboard.ts`, mobile's twin). */
export type ClipboardAccess = {
  write: (text: string) => void | Promise<void>;
  /** The clipboard's text, or `undefined` when it can't be read without asking the user. */
  read?: () => Promise<string | undefined>;
  /** Calls `onChange` when the user copies something else; returns the unsubscribe. */
  watch?: (onChange: () => void) => () => void;
};

type PendingClear = {
  value: string;
  clipboard: ClipboardAccess;
  timer: ReturnType<typeof setTimeout>;
  unwatch?: () => void;
};

/** One pending clear at a time: a fresh copy replaces it. */
let pending: PendingClear | undefined;

function takePendingClear(): PendingClear | undefined {
  const entry = pending;
  if (!entry) return undefined;
  pending = undefined;
  clearTimeout(entry.timer);
  entry.unwatch?.();
  return entry;
}

/**
 * Empties the clipboard unless it holds something newer: a readable clipboard
 * is compared, an unreadable one is cleared (`watch` has already dropped the
 * clear if the user copied something since). Best-effort: web needs document
 * focus for `writeText`, so a tab left meanwhile keeps the clipboard as it is.
 */
async function clearIfUnchanged({ value, clipboard }: PendingClear): Promise<void> {
  try {
    const current = clipboard.read ? await clipboard.read().catch(() => undefined) : undefined;
    if (current !== undefined && current !== value) return;
    await clipboard.write("");
  } catch {
    // The clipboard stays as it is.
  }
}

/**
 * Copies `value` and, with `clearSeconds > 0`, clears it again after that
 * delay. Resolves `false` when there was nothing to copy or the write failed
 * (the caller reports it), `true` once the value is on the clipboard.
 */
export async function copyToClipboard(
  clipboard: ClipboardAccess,
  value: string | undefined,
  clearSeconds: number,
): Promise<boolean> {
  if (!value) return false;
  try {
    await clipboard.write(value);
  } catch {
    return false;
  }

  takePendingClear();
  if (clearSeconds <= 0) return true;

  const entry: PendingClear = {
    value,
    clipboard,
    timer: setTimeout(() => {
      if (pending === entry) void clearIfUnchanged(takePendingClear() ?? entry);
    }, clearSeconds * 1_000),
  };
  entry.unwatch = clipboard.watch?.(() => {
    if (pending === entry) takePendingClear();
  });
  pending = entry;
  return true;
}

/**
 * Runs a pending clear now: on lock, before web's reload cancels the timer.
 * Bounded, so a clipboard that never answers can't hold the lock up.
 */
export async function flushClipboardClear(timeoutMs = 1_000): Promise<void> {
  const entry = takePendingClear();
  if (!entry) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    clearIfUnchanged(entry),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * `copyToClipboard` with the user's auto-clear preference. Every copy of a
 * secret goes through it (a lint rule bans a direct `writeText`).
 */
export function useCopyToClipboard(clipboard: ClipboardAccess) {
  const [clearSeconds] = useChoicePreference(CLIPBOARD_CLEAR_PREFERENCE);

  return useCallback(
    (value: string | undefined) => copyToClipboard(clipboard, value, clearSeconds),
    [clearSeconds, clipboard],
  );
}
