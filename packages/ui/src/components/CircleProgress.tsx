import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const circleProgressVariants = cva(
  cn(
    "flex flex-col items-center justify-center",
    "rounded-full bg-background",
    "bg-[radial-gradient(closest-side,var(--color-background)_calc((99-var(--line-value))*1%),transparent_calc((100-var(--line-value))*1%)_100%),conic-gradient(var(--color-border)_calc(var(--progress-value)*1%),var(--color-primary)_0)]",
  ),
  {
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
  },
);

type CircleProgressParams = {
  progress: number;
  line?: number;
  children?: ReactNode;
  className?: string;
} & VariantProps<typeof circleProgressVariants>;

function CircleProgress({
  progress = 30,
  line = 10,
  children,
  size,
  className,
}: CircleProgressParams) {
  return (
    <div
      className={cn(circleProgressVariants({ size, className }))}
      style={
        {
          "--progress-value": String(progress),
          "--line-value": String(line),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export { CircleProgress, circleProgressVariants };
