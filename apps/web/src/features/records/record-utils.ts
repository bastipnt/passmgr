import { useCopyToClipboard } from "@repo/client";
import { toast } from "@repo/ui";
import { useCallback } from "react";

export { CLIPBOARD_CLEAR_DEFAULT_SECONDS } from "@repo/client";

const writeText = (text: string) => navigator.clipboard.writeText(text);

export function copyField(value: string | undefined, label: string) {
  if (!value) return;
  void writeText(value);
  toast.success(`${label} copied to clipboard`);
}

/**
 * `copyField` plus the user's clipboard auto-clear preference — the timer lives
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

/** "https://github.com/login" → "github.com"; the input itself if it isn't a URL. */
export function displayHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
