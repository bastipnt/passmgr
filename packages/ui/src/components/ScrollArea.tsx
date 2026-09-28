"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@repo/ui/lib/utils";

/**
 * Scroll container with a custom overlay scrollbar that only shows while the
 * pointer is over the area or it is scrolling. Unlike the native one it works
 * the same in every browser (Firefox included) and respects rounded corners:
 * set `--scroll-area-inset` to the container's radius and the track stops
 * that far short of both ends. `className` styles the root (size, radius,
 * surface); `viewportClassName` the element that actually scrolls (padding,
 * scroll-padding, layout of the children).
 */
function ScrollArea({
  className,
  viewportClassName,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props & { viewportClassName?: string }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "z-20 flex touch-none select-none p-0.5 opacity-0 transition-opacity duration-200 data-horizontal:mx-(--scroll-area-inset,0px) data-vertical:my-(--scroll-area-inset,0px) data-horizontal:h-2.5 data-vertical:w-2.5 data-horizontal:flex-col data-hovering:opacity-100 data-scrolling:opacity-100 data-hovering:duration-100 data-scrolling:duration-0",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-foreground/25 transition-colors hover:bg-foreground/40 active:bg-foreground/40"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
