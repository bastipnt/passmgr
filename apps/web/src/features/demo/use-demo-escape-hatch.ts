import { toast } from "@repo/ui";
import { useEffect } from "react";
import { isDemoBuild, toggleDemoOverride } from "./demo-mode";

const TAPS = 7;
const WINDOW_MS = 3000;
const PAUSE_MS = 1000;

/** Counts taps; `tap` resolves true on the `TAPS`th within `WINDOW_MS`, none further than `PAUSE_MS` apart. */
export function createTapCounter() {
  let taps: number[] = [];
  return function tap(now: number): boolean {
    const last = taps.at(-1);
    if (last !== undefined && now - last > PAUSE_MS) taps = [];
    taps.push(now);
    if (taps.length < TAPS) return false;
    const done = now - taps[0]! <= WINDOW_MS;
    taps = [];
    return done;
  };
}

/** On a demo build: seven taps anywhere on the page toggle demo mode for this browser. */
export function useDemoEscapeHatch() {
  useEffect(() => {
    if (!isDemoBuild()) return;
    const tap = createTapCounter();
    const onPointerDown = (event: PointerEvent) => {
      if (!tap(event.timeStamp)) return;
      toast.success(
        toggleDemoOverride() ? "Demo mode on in this browser" : "Demo mode off in this browser",
      );
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
}
