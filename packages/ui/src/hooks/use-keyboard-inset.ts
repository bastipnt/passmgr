import { useEffect, useState } from "react";

/**
 * How far the on-screen keyboard reaches up from the bottom of the layout
 * viewport, in px; 0 while it's closed. iOS Safari keeps the layout viewport
 * and only shrinks the visual one; on Android `interactive-widget=resizes-content`
 * shrinks both, so this stays 0 and `bottom: 0` already sits on the keyboard.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Pinch-zoom shrinks the visual viewport too; scaled back, it's the keyboard alone.
        const covered =
          viewport.scale === 1
            ? window.innerHeight - viewport.height - viewport.offsetTop
            : window.innerHeight - viewport.height * viewport.scale;
        setInset(Math.max(0, Math.round(covered)));
      });
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    // iOS 26 can leave a stale offsetTop after the keyboard closes; measure again then.
    window.addEventListener("focusout", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      window.removeEventListener("focusout", measure);
      setInset(0);
    };
  }, [enabled]);

  return enabled ? inset : 0;
}
