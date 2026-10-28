import { type TouchEvent, useRef } from "react";

const DRAG_PX = 10;

/**
 * Touch handlers for a scroller that drops the on-screen keyboard once it's
 * dragged, the way native search lists do. A tap's jitter stays under the
 * threshold, so tapping a row keeps typing possible.
 */
export function useBlurOnDrag(field: { current: HTMLElement | null }) {
  const startY = useRef<number | undefined>(undefined);
  return {
    onTouchStart: (e: TouchEvent) => {
      startY.current = e.touches[0]?.clientY;
    },
    onTouchMove: (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (startY.current === undefined || y === undefined) return;
      if (Math.abs(y - startY.current) < DRAG_PX) return;
      startY.current = undefined;
      if (document.activeElement === field.current) field.current?.blur();
    },
  };
}
