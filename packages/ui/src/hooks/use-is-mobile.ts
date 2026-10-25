import { useMediaQuery } from "./use-media-query";

const QUERY = "(max-width: 639px)";

/** Current match, for code outside React (e.g. navigation handlers). */
export function isMobile() {
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile() {
  return useMediaQuery(QUERY);
}
