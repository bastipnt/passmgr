import { type RefObject, useEffect } from "react";

const supportsScrollTimeline = () =>
  typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");

function scrollParent(el: HTMLElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * JS fallback for the `scroll-collapse` utility in browsers without
 * scroll-driven animations (Firefox): sets --scroll-collapse on `target` from
 * its scroller's position over --scroll-collapse-range.
 */
export function useScrollCollapse(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = target.current;
    const scroller = el && scrollParent(el);
    if (!el || !scroller || supportsScrollTimeline()) return;

    let frame = 0;
    const update = () => {
      // Registered as <length>, so it computes to px.
      const range = Number.parseFloat(
        getComputedStyle(el).getPropertyValue("--scroll-collapse-range"),
      );
      const progress = range > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / range)) : 0;
      el.style.setProperty("--scroll-collapse", String(progress));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
    };
  }, [target]);
}
