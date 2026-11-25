import { isMobile } from "@repo/ui/hooks/use-is-mobile";
import { restoreScroll } from "@repo/ui/lib/restore-scroll";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { matchRoute, useRouter } from "wouter";
import { navigate } from "wouter/use-browser-location";

// Phone push/pop slide as a View Transition (apps/web/CLAUDE.md, phone pages): the router reads its
// location here, so a route change is held back until the transition has its "before" picture.

type Direction = "push" | "pop";
export type PageDepths = readonly (readonly [pattern: string, depth: number])[];
type Parser = ReturnType<typeof useRouter>["parser"];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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
// Entries Back stepped over, nearest first: a forward step lands on one of them.
let ahead: string[] = [];
// The `history.go` delta that takes the latest location change back; none after a replace.
let undoDelta: number | undefined;
// The step `undoNavigation` sent, read by the popstate it causes.
let pendingUndo: number | undefined;

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

function stepBack(index: number) {
  ahead = [...stack.slice(index + 1), ...ahead];
  undoDelta = stack.length - 1 - index;
  stack.length = index + 1;
}

function stepForward(count: number) {
  stack.push(...ahead.slice(0, count));
  ahead = ahead.slice(count);
  undoDelta = -count;
}

function trackStack(type: string, path: string) {
  const undone = pendingUndo;
  pendingUndo = undefined;
  if (type === "pushState") {
    stack.push(path);
    ahead = [];
    undoDelta = -1;
    return;
  }
  if (type === "replaceState") {
    stack[stack.length - 1] = path;
    undoDelta = undefined;
    return;
  }
  if (type !== "popstate") return;
  // An undo knows its step; guessing from the path would misread it when the path repeats.
  if (undone !== undefined && undone > 0 && undone <= ahead.length) return stepForward(undone);
  if (undone !== undefined && undone < 0 && -undone < stack.length) {
    return stepBack(stack.length - 1 + undone);
  }
  // popstate doesn't say which way or how far it went: an earlier entry for the path means back
  // (possibly several steps), one Back stepped over forward, anything else is off the stack.
  const index = stack.lastIndexOf(path, -2);
  const forward = ahead.indexOf(path);
  if (index !== -1) {
    stepBack(index);
  } else if (forward !== -1) {
    stepForward(forward + 1);
  } else {
    stack.push(path);
    ahead = [];
    undoDelta = undefined;
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
  // `ready` rejects whenever the slide doesn't play (the next navigation skipped it, a hidden tab,
  // a resize): no error. A failing update rejects all three promises; `finished` alone reports it.
  void transition.ready.catch(() => {});
  void transition.updateCallbackDone.catch(() => {});
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

/** Render once, before the routes, in `<Router hook={usePageLocation} searchHook={usePageSearch}>`:
 * its layout effects run first, so a first-render redirect already sees the depth table. */
export function PageTransitions({ pageDepths }: { pageDepths: PageDepths }) {
  const router = useRouter();
  const [path] = usePageLocation();

  useLayoutEffect(() => {
    depths = pageDepths;
    parser = router.parser;
  }, [pageDepths, router.parser]);

  useLayoutEffect(() => {
    if (pendingScroll === undefined) return;
    cancelRestore = restoreScroll(window, pendingScroll);
    pendingScroll = undefined;
  }, [path]);

  return null;
}

/** Takes the latest navigation back without adding an entry (Keep editing after Back), or runs
 * `fallback` when history can't: after a replace, or a step off the in-app stack. */
export function undoNavigation(fallback: () => void) {
  const delta = undoDelta;
  undoDelta = undefined;
  if (delta === undefined) return fallback();
  pendingUndo = delta;
  history.go(delta);
}

/** Steps back to the nearest shallower entry, so history doesn't grow (apps/web/CLAUDE.md, phone
 * pages); with none in reach (deep link, reload) it replaces the page with `fallback`. */
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
