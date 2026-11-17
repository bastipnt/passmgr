import { toast } from "@repo/ui";
import { useCallback } from "react";
import { useCopySecret } from "@/lib/clipboard";

/** Copies a record field (auto-cleared per the user's preference) and says whether it worked. */
export function useCopyField() {
  const copy = useCopySecret();

  return useCallback(
    (value: string | undefined, label: string) => {
      if (!value) return;
      void copy(value).then((copied) => {
        if (copied) toast.success(`${label} copied to clipboard`);
        else toast.error("Couldn't copy to the clipboard");
      });
    },
    [copy],
  );
}
