import Clipboard from "@react-native-clipboard/clipboard";
import { useCopyToClipboard } from "@repo/client";
import { useCallback } from "react";

const write = (text: string) => Clipboard.setString(text);

/** Copies a record field, honouring the clipboard auto-clear preference. */
export function useCopyField() {
  const copy = useCopyToClipboard(write);

  return useCallback((value?: string) => void copy(value), [copy]);
}
