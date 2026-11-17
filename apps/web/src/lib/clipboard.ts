import { type ClipboardAccess, useCopyToClipboard } from "@repo/client";

/**
 * The browser's clipboard. Reads only once the user has granted
 * `clipboard-read` (else the auto-clear would raise a paste prompt); without
 * it a copy in the page drops the pending clear instead. A copy in another app
 * can't be seen, but the clear needs this tab focused, so it only runs once the
 * user is back.
 */
export const webClipboard = {
  // The one direct write: everything else copies through `useCopySecret`.
  // oxlint-disable-next-line no-restricted-properties
  write: (text: string) => navigator.clipboard.writeText(text),
  read: async () => {
    try {
      const permission = await navigator.permissions.query({
        name: "clipboard-read" as PermissionName,
      });
      return permission.state === "granted" ? await navigator.clipboard.readText() : undefined;
    } catch {
      return undefined;
    }
  },
  watch: (onChange: () => void) => {
    document.addEventListener("copy", onChange);
    document.addEventListener("cut", onChange);
    return () => {
      document.removeEventListener("copy", onChange);
      document.removeEventListener("cut", onChange);
    };
  },
} satisfies ClipboardAccess;

/** Copies with the user's auto-clear preference; resolves `false` when the copy failed. */
export function useCopySecret() {
  return useCopyToClipboard(webClipboard);
}
