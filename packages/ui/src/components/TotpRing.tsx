import { cn } from "@repo/ui/lib/utils";
import { useLayoutEffect, useRef } from "react";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type TotpRingProps = {
  /** Current TOTP period index — the ring refills whenever it changes. */
  period: number;
  periodMs: number;
  /** Whole seconds left in the period, shown in the center. */
  seconds?: number;
  className?: string;
};

/**
 * Countdown ring for a TOTP period. Instead of stepping the arc once per
 * second, it runs a single linear stroke-dashoffset transition spanning the
 * remaining period, restarted at each rollover — smooth and compositor-driven.
 */
function TotpRing({ period, periodMs, seconds, className }: TotpRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);

  useLayoutEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;
    const remainingMs = periodMs - (Date.now() % periodMs);
    circle.style.transition = "none";
    circle.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - remainingMs / periodMs)}`;
    // flush the reset so the drain below transitions from it, not from the old value
    void circle.getBoundingClientRect();
    circle.style.transition = `stroke-dashoffset ${remainingMs}ms linear`;
    circle.style.strokeDashoffset = `${CIRCUMFERENCE}`;
  }, [period, periodMs]);

  const low = seconds !== undefined && seconds <= 5;

  return (
    <div
      className={cn(
        "relative flex size-9.5 items-center justify-center",
        low ? "text-destructive" : "text-primary",
        className,
      )}
    >
      <svg
        className="absolute inset-0 -rotate-90 size-full"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r={RADIUS} stroke="var(--color-muted)" strokeWidth={8} />
        <circle
          ref={circleRef}
          cx="50"
          cy="50"
          r={RADIUS}
          stroke="currentColor"
          strokeWidth={8}
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
        />
      </svg>
      <span className="relative text-sm tabular-nums text-muted-foreground">{seconds}</span>
    </div>
  );
}

export { TotpRing };
