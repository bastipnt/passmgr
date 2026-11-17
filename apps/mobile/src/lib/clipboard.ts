import { type ClipboardAccess, useCopyToClipboard } from "@repo/client";
// The one clipboard import: everything else copies through `useCopySecret`.
// oxlint-disable-next-line no-restricted-imports
import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

/**
 * The device clipboard. Only Android reads it back before the auto-clear (the
 * foreground app may, silently); iOS would ask the user to allow pasting, so
 * there the clear empties the clipboard unread. Android 10+ hands a background
 * app an empty clipboard, so an empty read counts as unreadable: else the clear
 * would skip the secret the user switched apps to paste.
 */
export const nativeClipboard = {
  write: async (text: string) => {
    if (!(await Clipboard.setStringAsync(text))) throw new Error("Clipboard write failed");
  },
  ...(Platform.OS === "android"
    ? { read: async () => (await Clipboard.getStringAsync()) || undefined }
    : {}),
} satisfies ClipboardAccess;

/** Copies with the user's auto-clear preference; resolves `false` when the copy failed. */
export function useCopySecret() {
  return useCopyToClipboard(nativeClipboard);
}
