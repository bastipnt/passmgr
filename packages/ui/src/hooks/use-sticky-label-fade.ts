import { type RefObject, useEffect } from "react";

const supportsViewTimeline = () =>
  typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");

function scrollerTop(el: HTMLElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") {
      return node.getBoundingClientRect().top + node.clientTop;
    }
  }
  return 0;
}

function fadeLabels(root: HTMLElement) {
  for (const label of root.querySelectorAll<HTMLElement>(".sticky-label")) {
    const pinnedTop = scrollerTop(label) + Number.parseFloat(getComputedStyle(label).top);
    const pushed = pinnedTop - label.getBoundingClientRect().top;
    const progress = Math.min(1, Math.max(0, pushed / label.offsetHeight));
    label.style.opacity = progress > 0 ? String(1 - progress) : "";
  }
}

/**
 * JS fallback for the `sticky-label` utility's exit fade in browsers without
 * scroll-driven animations (Firefox): fades each `.sticky-label` under `root`
 * as the next section pushes it out. `deps` re-syncs after the labels change.
 */
export function useStickyLabelFade(root: RefObject<HTMLElement | null>, deps: unknown) {
  useEffect(() => {
    const el = root.current;
    if (!el || supportsViewTimeline()) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fadeLabels(el));
    };
    schedule();
    // Scroll doesn't bubble, but capture sees it from whichever ancestor scrolls.
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [root, deps]);
}
