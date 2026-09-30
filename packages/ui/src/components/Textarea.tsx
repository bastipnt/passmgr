import { fieldClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClassName,
        "field-sizing-content flex min-h-20 w-full px-3 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
