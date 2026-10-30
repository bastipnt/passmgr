import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

const FADE = "1.5rem";

/**
 * A tray with one horizontally scrolling row of chips (`<li>`s) and an optional
 * action pinned at its end. The row's edges fade where more chips are hidden.
 */
export function ChipLane({
  label,
  action,
  className,
  children,
}: {
  /** Accessible name of the chip list. */
  label: string;
  /** Pinned after the row, e.g. "Clear all". */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const start = list.scrollLeft > 1;
    const end = Math.ceil(list.scrollLeft + list.clientWidth) < list.scrollWidth - 1;
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Chips come and go with the filters, so watch the row's content as well as its box.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    const mutations = new MutationObserver(() => {
      observer.disconnect();
      observer.observe(list);
      for (const child of list.children) observer.observe(child);
      measure();
    });
    mutations.observe(list, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [measure]);

  const mask = `linear-gradient(to right, ${fade.start ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${fade.end ? "transparent" : "#000"})`;

  return (
    <div
      className={cn(
        "flex items-center rounded-2xl bg-foreground/4 p-0.5 dark:bg-white/6",
        className,
      )}
    >
      <ul
        ref={listRef}
        aria-label={label}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]"
      >
        {children}
      </ul>
      {action && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          {action}
        </>
      )}
    </div>
  );
}
