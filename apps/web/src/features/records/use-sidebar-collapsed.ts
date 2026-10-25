import { PREF_KEYS, usePreference } from "@repo/client";
import { useMediaQuery } from "@repo/ui/hooks/use-media-query";

/** Tailwind `lg`: narrower, an expanded sidebar would squeeze the detail pane, so it stays a rail. */
const WIDE_QUERY = "(min-width: 64rem)";

/** `setCollapsed` is undefined where the sidebar can't expand. */
export function useSidebarCollapsed(): [boolean, ((collapsed: boolean) => void) | undefined] {
  const wide = useMediaQuery(WIDE_QUERY);
  const [stored, setStored] = usePreference<boolean>(PREF_KEYS.sidebarCollapsed, false);
  return wide ? [stored, setStored] : [true, undefined];
}
