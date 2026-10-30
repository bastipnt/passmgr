import { type RefObject, useEffect } from "react";

/** Whether `element` can scroll along the drag's axis. */
function scrolls(element: Element, vertical: boolean): boolean {
  const style = getComputedStyle(element);
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  return vertical
    ? element.scrollHeight > element.clientHeight + 1
    : element.scrollWidth > element.clientWidth + 1;
}

/**
 * For a full-screen `position: fixed` layer over a page that scrolls the
 * document (the phone search). While `active`:
 *
 * - It follows the visual viewport. With the keyboard up, iOS pans the visual
 *   viewport inside the layout viewport (focusing a field, or the page behind
 *   restoring its scroll), which would push a layer pinned to `top: 0` off the
 *   top of the screen; this also ends it above the keyboard.
 * - A drag that scrolls nothing inside it (its bar, a list too short to scroll)
 *   doesn't scroll the page behind. iOS ignores `overflow: hidden` on the root
 *   for touch, and `overscroll-behavior` only holds on a scroller that scrolls.
 */
export function useViewportLayer(layer: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = layer.current;
    const viewport = window.visualViewport;
    if (!active || !element || !viewport) return;
    const pin = () => {
      // Pinch-zoomed: leave the layer to the layout viewport.
      const zoomed = Math.abs(viewport.scale - 1) > 0.01;
      element.style.top = zoomed ? "" : `${viewport.offsetTop}px`;
      element.style.height = zoomed ? "" : `${viewport.height}px`;
    };
    pin();
    viewport.addEventListener("resize", pin);
    viewport.addEventListener("scroll", pin);
    return () => {
      viewport.removeEventListener("resize", pin);
      viewport.removeEventListener("scroll", pin);
      element.style.top = "";
      element.style.height = "";
    };
  }, [layer, active]);

  useEffect(() => {
    const element = layer.current;
    if (!active || !element) return;
    let start: { x: number; y: number } | undefined;
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      start = touch && e.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : undefined;
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      // Two fingers: a pinch, leave it to the browser.
      if (!start || !touch || !e.cancelable) return;
      const vertical = Math.abs(touch.clientY - start.y) >= Math.abs(touch.clientX - start.x);
      for (
        let node = e.target as Element | null;
        node && node !== element;
        node = node.parentElement
      )
        if (scrolls(node, vertical)) return;
      e.preventDefault();
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
    };
  }, [layer, active]);
}
