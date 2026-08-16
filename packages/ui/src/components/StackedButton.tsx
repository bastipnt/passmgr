import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type StackedButtonProps = {
  children: [ReactNode, ReactNode];
  className?: string;
};

function StackedButton({ children, className }: StackedButtonProps) {
  return (
    <div
      className={cn(
        "grid! grid-cols-1 grid-rows-1 p-0! [&_button]:col-start-1 [&_button]:row-start-1",
        "[&_button]:first:py-2.5 [&_button]:first:pr-14 [&_button]:first:pl-3", // first button
        "[&_button]:last:mr-3 [&_button]:last:place-self-end [&_button]:last:self-center", // second button
        className,
      )}
    >
      {children}
    </div>
  );
}

export { StackedButton };
