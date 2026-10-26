import { useLayoutEffect } from "react";

let mounted = 0;

/**
 * Marks the document as the unlocked app while mounted: `data-ground="flat"`
 * on <html> drops the light field for the preset's flat ground and turns
 * glass into solid panels (globals.css). It sits on <html> because popups
 * portal out of the page. A layout effect, so the first frame is already flat;
 * counted, since shells can overlap during a route change.
 */
export function useFlatGround() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    mounted += 1;
    root.dataset.ground = "flat";
    return () => {
      mounted -= 1;
      if (mounted === 0) delete root.dataset.ground;
    };
  }, []);
}
