import Clipboard from "@react-native-clipboard/clipboard";
import { useCopyToClipboard } from "@repo/client";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";

const write = (text: string) => Clipboard.setString(text);

/**
 * Copies a record field, honouring the clipboard auto-clear preference. A
 * success haptic confirms it — the whole row is the copy button, so there is
 * no icon to flip.
 */
export function useCopyField() {
  const copy = useCopyToClipboard(write);

  return useCallback(
    (value?: string) => {
      if (copy(value)) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [copy],
  );
}
