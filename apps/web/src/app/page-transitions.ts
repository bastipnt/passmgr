import { isMobile } from "@repo/ui/hooks/use-is-mobile";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { matchRoute, useRouter } from "wouter";
import { navigate } from "wouter/use-browser-location";

/**
 * Phone page stack: routes are real pages that scroll the document, and moving
 * between stack depths slides like a native push/pop — the outgoing page slides
 * left while the new one comes in from the right, reversed on the way back.
 *
 * Only one page is mounted at a time. The slide is a View Transition: the
 * browser snapshots the page before and after the route change and animates
 * the two pictures (CSS in `@repo/ui/styles/globals.css`, keyed off
 * `html[data-nav]`). To get a "before" picture at all, the route change has to
 * be held back until the transition asks for it — so this module is the
 * router's location source (`usePageLocation`/`usePageSearch`), and publishes a
 * new location to React only inside the transition's update callback.
 *
 * Direction comes from the depth table (`pageDepths` in `route-paths.ts`), not
 * from how the navigation happened: Links, redirects, back buttons and the
 * browser's own back all animate the same way.
 */

type Direction = "push" | "pop";
export type PageDepths = readonly (readonly [pattern: string, depth: number])[];
type Parser = ReturnType<typeof useRouter>["parser"];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** How long a pop keeps trying to reach its saved offset while the page loads in. */
const RESTORE_TIMEOUT_MS = 1000;

let depths: PageDepths = [];
let parser: Parser | undefined;

// What React sees. Lags `location` while a transition is capturing the old page.
let committedPath = location.pathname;
let committedSearch = location.search;

const listeners = new Set<() => void>();

// Document scroll per pathname, so going back lands where the page was left.
const scrollPositions = new Map<string, number>();
let pendingScroll: number | undefined;
let cancelRestore: (() => void) | undefined;

// In-app history (pathnames), to tell how far "back" has to step, or whether it
// can at all. Memory only: after a reload the first page has nothing behind it.
const stack: string[] = [location.pathname];

// Latest transition, so a superseded one doesn't clear the next one's `data-nav`.
let transitionId = 0;

function depthOf(path: string): number | undefined {
  if (!parser) return undefined;
  for (const [pattern, depth] of depths) {
    if (matchRoute(parser, pattern, path)[0]) return depth;
  }
  return undefined;
}

export function directionBetween(from: string, to: string): Direction | undefined {
  const fromDepth = depthOf(from);
  const toDepth = depthOf(to);
  if (fromDepth === undefined || toDepth === undefined || fromDepth === toDepth) return undefined;
  return toDepth > fromDepth ? "push" : "pop";
}

function trackStack(type: string, path: string) {
  if (type === "pushState") {
    stack.push(path);
  } else if (type === "replaceState") {
    stack[stack.length - 1] = path;
  } else {
    // popstate doesn't say which way or how far it went: an earlier entry for
    // the path means back (possibly several steps), anything else forward.
    const index = stack.lastIndexOf(path, -2);
    if (index === -1) stack.push(path);
    else stack.length = index + 1;
  }
}

function publish() {
  committedPath = location.pathname;
  committedSearch = location.search;
  for (const listener of listeners) listener();
}

function shouldAnimate(direction: Direction | undefined, event: Event) {
  return (
    direction !== undefined &&
    typeof document.startViewTransition === "function" &&
    isMobile() &&
    !window.matchMedia(REDUCED_MOTION_QUERY).matches &&
    // iOS swipe-back already played its own slide; a second one would double it.
    !(event instanceof PopStateEvent && event.hasUAVisualTransition)
  );
}

function onLocationChange(event: Event) {
  // A restore still chasing the last page's offset must not drag this one.
  cancelRestore?.();
  const from = committedPath;
  const to = location.pathname;
  trackStack(event.type, to);

  if (from === to) {
    publish();
    return;
  }

  const direction = directionBetween(from, to);
  scrollPositions.set(from, window.scrollY);
  // Same depth (a sheet route over its page) keeps the page where it is.
  pendingScroll =
    direction === "push" ? 0 : direction === "pop" ? (scrollPositions.get(to) ?? 0) : undefined;

  if (!shouldAnimate(direction, event)) {
    publish();
    return;
  }

  const root = document.documentElement;
  const id = ++transitionId;
  root.dataset.nav = direction;
  // `flushSync` commits the new page — and `PageTransitions`' scroll
  // restore — before the browser takes its "after" picture.
  const transition = document.startViewTransition(() => flushSync(publish));
  void transition.finished.finally(() => {
    if (id === transitionId) delete root.dataset.nav;
  });
}

if (typeof window !== "undefined") {
  history.scrollRestoration = "manual";
  for (const type of ["popstate", "pushState", "replaceState"]) {
    addEventListener(type, onLocationChange);
  }
}

/**
 * Scrolls to `top`. A page still loading in (a lazy chunk, a Suspense
 * fallback) may be too short to get there yet: keep retrying as it grows,
 * until it fits, the user takes over, or it times out.
 */
function restoreScroll(top: number) {
  window.scrollTo(0, top);
  if (window.scrollY >= top - 1 || typeof ResizeObserver === "undefined") return;

  const retry = () => {
    window.scrollTo(0, top);
    if (window.scrollY >= top - 1) stop();
  };
  const observer = new ResizeObserver(retry);
  const timer = setTimeout(() => stop(), RESTORE_TIMEOUT_MS);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    removeEventListener("wheel", stop);
    removeEventListener("touchstart", stop);
    cancelRestore = undefined;
  };
  observer.observe(document.body);
  addEventListener("wheel", stop, { passive: true });
  addEventListener("touchstart", stop, { passive: true });
  cancelRestore = stop;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getPath = () => committedPath;
const getSearch = () => committedSearch;

/** wouter location hook: the pathname, published through page transitions. */
export function usePageLocation(): [string, typeof navigate] {
  return [useSyncExternalStore(subscribe, getPath), navigate];
}

/** wouter search hook, published together with `usePageLocation`. */
export function usePageSearch(): string {
  return useSyncExternalStore(subscribe, getSearch);
}

/**
 * Registers the depth table and applies scroll restoration. Render once,
 * before the routes, inside a
 * `<Router hook={usePageLocation} searchHook={usePageSearch}>`. Its layout
 * effects run before the routes' own, so a redirect on first render already
 * sees the table.
 */
export function PageTransitions({ pageDepths }: { pageDepths: PageDepths }) {
  const router = useRouter();
  const [path] = usePageLocation();

  useLayoutEffect(() => {
    depths = pageDepths;
    parser = router.parser;
  }, [pageDepths, router.parser]);

  useLayoutEffect(() => {
    if (pendingScroll === undefined) return;
    restoreScroll(pendingScroll);
    pendingScroll = undefined;
  }, [path]);

  return null;
}

/**
 * Back button for a pushed page: steps back through history to the nearest
 * shallower page, so Back and the browser's back agree and history doesn't
 * grow — skipping entries at the same depth, like a closed sheet
 * (`/record/a/edit` → `/record/a` leaves `/record/a` twice). With none in
 * reach (deep link, reload) it replaces the page with `fallback`.
 */
export function usePageBack(fallback: string) {
  return () => {
    const depth = depthOf(stack[stack.length - 1]);
    for (let i = stack.length - 2; i >= 0; i--) {
      const target = depthOf(stack[i]);
      if (depth === undefined || (target !== undefined && target < depth)) {
        history.go(i - (stack.length - 1));
        return;
      }
    }
    navigate(fallback, { replace: true });
  };
}
