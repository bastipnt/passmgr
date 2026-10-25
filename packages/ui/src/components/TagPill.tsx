import { buttonVariants } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";

type TagPillProps = Omit<ComponentProps<"button">, "children"> & {
  tag: string;
  /** Filled, with a ×: clicking removes it. */
  selected?: boolean;
  count?: number;
};

/** A tag as a filter: pick it, or (selected) remove it again. */
export function TagPill({ tag, selected, count, className, ...props }: TagPillProps) {
  return (
    <button
      type="button"
      aria-label={
        selected ? `Remove tag ${tag}` : count === undefined ? undefined : `${tag} (${count})`
      }
      className={cn(
        buttonVariants({ variant: selected ? "default" : "outline", size: "sm" }),
        "rounded-full px-3 text-[0.84rem] disabled:opacity-45",
        selected && "pr-1.5",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="font-semibold opacity-70">
        #
      </span>
      {tag}
      {count !== undefined && !selected && (
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      )}
      {selected && (
        <span
          aria-hidden
          className="ml-0.5 grid size-5 place-items-center rounded-full bg-white/18 [&_svg]:size-3!"
        >
          <XIcon strokeWidth={2.6} />
        </span>
      )}
    </button>
  );
}
