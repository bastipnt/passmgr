import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Locks the vault after `minutes` without user activity. `0` disables it.
 *
 * Mount once — the timer is global to the session, not per-component.
 */
export function useIdleLock(minutes: number, lock: () => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (minutes <= 0) return;

    const timeoutMs = minutes * 60 * 1_000;
    let lastActivity = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    function arm(delayMs: number) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Background tabs throttle timers, so re-check the clock rather than
        // trusting that `delayMs` has actually elapsed.
        const idleFor = Date.now() - lastActivity;
        if (idleFor >= timeoutMs) lockRef.current();
        else arm(timeoutMs - idleFor);
      }, delayMs);
    }

    function onActivity() {
      lastActivity = Date.now();
      arm(timeoutMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // Coming back from the background is not activity — a tab left idle past
      // the timeout must lock on return.
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= timeoutMs) lockRef.current();
      else arm(timeoutMs - idleFor);
    }

    arm(timeoutMs);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [minutes]);
}
