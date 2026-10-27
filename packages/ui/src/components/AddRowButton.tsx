import { Button } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import { PlusIcon } from "lucide-react";
import type { ComponentProps } from "react";

/** A dashed, full-width slot under a list of boxed rows that adds one more. */
export function AddRowButton({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-12 w-full rounded-[13px] border-[1.5px] border-foreground/12 border-dashed font-semibold text-primary-text hover:border-primary/40 hover:bg-primary/5 hover:text-primary-text aria-expanded:border-primary/40 aria-expanded:bg-primary/5 dark:border-white/14",
        className,
      )}
      {...props}
    >
      <PlusIcon />
      {children}
    </Button>
  );
}
