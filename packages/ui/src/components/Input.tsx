import { fieldClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClassName,
        "h-10 in-data-[variant=glass]:h-12 w-full min-w-0 px-3 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
