import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

/**
 * `variant="glass"` is the frosted hero card of the auth screens: 28px radius,
 * roomier padding and a display-face title. Needs a `.light-field` behind it.
 */
function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; variant?: "default" | "glass" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-card/70 py-4 text-card-foreground text-sm ring-1 ring-foreground/8 before:pointer-events-none has-[>img:first-child]:pt-0 has-data-[slot=card-footer]:pb-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 dark:bg-white/[0.03] dark:ring-white/10 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        "data-[variant=glass]:glass data-[variant=glass]:gap-6 data-[variant=glass]:rounded-[28px] data-[variant=glass]:bg-(--glass-fill) data-[variant=glass]:py-7 data-[variant=glass]:ring-0 max-sm:data-[variant=glass]:rounded-3xl",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] group-data-[variant=glass]/card:gap-1.5 group-data-[size=sm]/card:px-3 group-data-[variant=glass]/card:px-8 max-sm:group-data-[variant=glass]/card:px-6 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-semibold text-base leading-snug group-data-[variant=glass]/card:font-bold group-data-[variant=glass]/card:font-display group-data-[size=sm]/card:text-sm group-data-[variant=glass]/card:text-[1.75rem] group-data-[variant=glass]/card:leading-tight group-data-[variant=glass]/card:tracking-[-0.02em]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-4 group-data-[size=sm]/card:px-3 group-data-[variant=glass]/card:px-8 max-sm:group-data-[variant=glass]/card:px-6",
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl p-4 group-data-[size=sm]/card:p-3 group-data-[variant=glass]/card:px-8 group-data-[variant=glass]/card:pb-0 max-sm:group-data-[variant=glass]/card:px-6",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
