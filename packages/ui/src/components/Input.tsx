import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 in-data-[variant=glass]:h-12 w-full min-w-0 rounded-lg border border-foreground/12 bg-field px-3 py-1 text-base shadow-[inset_0_1px_2px_rgb(22_20_31/0.06)] outline-none transition-[color,background-color,border-color,box-shadow] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/50 aria-invalid:bg-white aria-invalid:ring-4 aria-invalid:ring-destructive/10 md:text-sm dark:border-white/14 dark:bg-white/5 dark:shadow-none dark:aria-invalid:border-destructive/45 dark:aria-invalid:bg-white/5 dark:focus-visible:bg-white/5 dark:focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
