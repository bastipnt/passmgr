import { toast } from "@repo/ui-native";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { useCopySecret } from "@/lib/clipboard";

/**
 * Copies a record field, honouring the clipboard auto-clear preference. A
 * success haptic confirms it — the whole row is the copy button, so there is
 * no icon to flip.
 */
export function useCopyField() {
  const copy = useCopySecret();

  return useCallback(
    (value?: string) => {
      if (!value) return;
      void copy(value).then((copied) => {
        if (copied) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else toast.error("Couldn't copy to the clipboard");
      });
    },
    [copy],
  );
}
