import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 639px)";

/** Current match, for code outside React (e.g. navigation handlers). */
export function isMobile() {
  return window.matchMedia(QUERY).matches;
}

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, isMobile, () => false);
}
