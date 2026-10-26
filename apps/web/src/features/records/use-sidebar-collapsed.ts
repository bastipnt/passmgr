import { PREF_KEYS, usePreference } from "@repo/client";
import { useMediaQuery } from "@repo/ui/hooks/use-media-query";
import { type RefObject, useEffect, useRef } from "react";

/** 1200px: narrower, the expanded sidebar beside the list would leave the record under ~640px, so it stays a rail. */
const WIDE_QUERY = "(min-width: 75rem)";

/**
 * `setCollapsed` is undefined where the sidebar can't expand. `toggleRef` goes on the toggle: it sits
 * in the header expanded and at the rail's foot collapsed, a new mount each switch, so focus follows it.
 */
export function useSidebarCollapsed(): [
  boolean,
  ((collapsed: boolean) => void) | undefined,
  RefObject<HTMLButtonElement | null>,
] {
  const wide = useMediaQuery(WIDE_QUERY);
  const [stored, setStored] = usePreference<boolean>(PREF_KEYS.sidebarCollapsed, false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const collapsed = wide ? stored : true;

  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    toggleRef.current?.focus();
  }, [collapsed]);

  const setCollapsed = (next: boolean) => {
    toggled.current = true;
    setStored(next);
  };
  return [collapsed, wide ? setCollapsed : undefined, toggleRef];
}
