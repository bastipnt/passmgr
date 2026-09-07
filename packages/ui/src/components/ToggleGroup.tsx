import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle } from "@repo/ui/components/Toggle";
import { cn } from "@repo/ui/lib/utils";

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        "flex w-fit items-center gap-1 rounded-xl border border-border bg-muted/50 p-1 data-vertical:flex-col data-vertical:items-stretch dark:bg-input/30",
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
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
