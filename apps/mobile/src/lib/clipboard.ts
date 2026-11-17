import { type ClipboardAccess, useCopyToClipboard } from "@repo/client";
// The one clipboard import: everything else copies through `useCopySecret`.
// oxlint-disable-next-line no-restricted-imports
import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

/**
 * The device clipboard. Only Android reads it back before the auto-clear (the
 * foreground app may, silently); iOS would ask the user to allow pasting, so
 * there the clear empties the clipboard unread.
 */
export const nativeClipboard = {
  write: async (text: string) => {
    if (!(await Clipboard.setStringAsync(text))) throw new Error("Clipboard write failed");
  },
  ...(Platform.OS === "android" ? { read: () => Clipboard.getStringAsync() } : {}),
} satisfies ClipboardAccess;

/** Copies with the user's auto-clear preference; resolves `false` when the copy failed. */
export function useCopySecret() {
  return useCopyToClipboard(nativeClipboard);
}
