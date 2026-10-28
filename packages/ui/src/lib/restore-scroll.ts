/** How long a restore keeps trying to reach its offset while the content renders in. */
const RESTORE_TIMEOUT_MS = 1000;

/**
 * Scrolls `scroller` (the document for `window`) to `top`, and while the
 * content is still too short to get there, again each time it grows, until it
 * arrives, the user scrolls, or the timeout passes. Returns a stop function.
 */
export function restoreScroll(scroller: HTMLElement | Window, top: number): () => void {
  const element = scroller instanceof HTMLElement ? scroller : undefined;
  const scrollTo = () => {
    if (element) element.scrollTop = top;
    else window.scrollTo(0, top);
  };
  const arrived = () => (element ? element.scrollTop : window.scrollY) >= top - 1;

  scrollTo();
  if (arrived() || typeof ResizeObserver === "undefined") return () => {};

  const observer = new ResizeObserver(() => {
    scrollTo();
    if (arrived()) stop();
  });
  const timer = setTimeout(() => stop(), RESTORE_TIMEOUT_MS);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    removeEventListener("wheel", stop);
    removeEventListener("touchstart", stop);
  };
  if (element) for (const child of element.children) observer.observe(child);
  else observer.observe(document.body);
  addEventListener("wheel", stop, { passive: true });
  addEventListener("touchstart", stop, { passive: true });
  return stop;
}
