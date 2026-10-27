import { useCopyToClipboard } from "@repo/client";
import { toast } from "@repo/ui";
import { useCallback } from "react";

const writeText = (text: string) => navigator.clipboard.writeText(text);

/**
 * Copies with the user's clipboard auto-clear preference — the timer lives
 * in `@repo/client` so mobile clears on the same schedule.
 */
export function useCopyField() {
  const copy = useCopyToClipboard(writeText);

  return useCallback(
    (value: string | undefined, label: string) => {
      if (copy(value)) toast.success(`${label} copied to clipboard`);
    },
    [copy],
  );
}
