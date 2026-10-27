import { fieldClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

type TextareaProps = React.ComponentProps<"textarea"> & {
  /**
   * Grow with the content only up to `max-h-80`, then scroll. Dragging the
   * resize handle writes an inline height, which lifts the cap.
   */
  capped?: boolean;
};

function Textarea({ className, capped = false, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClassName,
        "field-sizing-content flex min-h-20 w-full px-3 py-2.5",
        capped && "resize-y [&:not([style*=height])]:max-h-80",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
