import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle } from "@repo/ui/components/Toggle";
import { cn } from "@repo/ui/lib/utils";

/** `variant="segmented"`: a recessed well whose pressed item is a raised card (settings). */
function ToggleGroup({
  className,
  variant = "default",
  ...props
}: ToggleGroupPrimitive.Props & { variant?: "default" | "segmented" }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-1 rounded-xl border border-border bg-muted/50 p-1 data-vertical:flex-col data-vertical:items-stretch dark:bg-input/30",
        "data-[variant=segmented]:gap-0 data-[variant=segmented]:rounded-[14px] data-[variant=segmented]:border-input data-[variant=segmented]:bg-field data-[variant=segmented]:p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof Toggle>) {
  return (
    <Toggle
      data-slot="toggle-group-item"
      variant="outline"
      className={cn(
        "min-w-0 flex-1",
        "group-data-[variant=segmented]/toggle-group:h-7.5 group-data-[variant=segmented]/toggle-group:rounded-[11px] group-data-[variant=segmented]/toggle-group:border-0 group-data-[variant=segmented]/toggle-group:px-3.5 group-data-[variant=segmented]/toggle-group:data-pressed:bg-card group-data-[variant=segmented]/toggle-group:data-pressed:shadow-[0_1px_2px_rgb(30_20_26/0.12)] group-data-[variant=segmented]/toggle-group:hover:bg-transparent max-sm:group-data-[variant=segmented]/toggle-group:h-9 max-sm:group-data-[variant=segmented]/toggle-group:px-3",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
