import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const circleProgressVariants = cva("relative flex items-center justify-center", {
  variants: {
    size: {
      default: "h-9.5 w-9.5",
      xs: "h-7 w-7 text-xs",
      sm: "h-8 w-8 text-sm",
      xl: "h-10 w-10 text-xl",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

type CircleProgressParams = {
  /** Progress value from 0 to 100 */
  progress: number;
  strokeWidth?: number;
  children?: ReactNode;
  className?: string;
} & VariantProps<typeof circleProgressVariants>;

function getProgressColor(progress: number) {
  if (progress > 33) return "text-primary";
  if (progress > 16) return "text-yellow-500";
  return "text-red-500";
}

function CircleProgress({
  progress,
  strokeWidth = 8,
  children,
  size,
  className,
}: CircleProgressParams) {
  const offset = CIRCUMFERENCE * (1 - progress / 100);

  return (
    <div className={cn(circleProgressVariants({ size, className }))}>
      <svg
        className={cn("absolute inset-0 -rotate-90 size-full", getProgressColor(progress))}
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r={RADIUS} stroke="var(--color-border)" strokeWidth={strokeWidth} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="relative">{children}</span>
    </div>
  );
}

export { CircleProgress, circleProgressVariants };
