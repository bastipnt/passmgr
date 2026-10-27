import { cn } from "@repo/ui/lib/utils";
import { GripVerticalIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type SortableListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  onMove: (from: number, to: number) => void;
  /** Names a row for its handle and the move announcement, e.g. "github.com". */
  itemName: (item: T, index: number) => string;
  /** `handle` is the row's grab handle, to place inside the row. */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  className?: string;
};

type Point = { x: number; y: number };

/** `centers` and `pointer` are measured when the drag starts. */
type Drag = {
  from: number;
  over: number;
  dx: number;
  dy: number;
  pointer: Point;
  centers: Point[];
};

/**
 * A list (a column or a grid, in DOM order) reordered by dragging a row's handle
 * (mouse, touch, pen) or by ↑ / ↓ on the focused handle. Only the handle starts a
 * drag, so a touch on the rest of a row still scrolls the page.
 */
export function SortableList<T>({
  items,
  getKey,
  onMove,
  itemName,
  renderItem,
  className,
}: SortableListProps<T>) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAfterMove = useRef<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Reordering keyed rows can move the focused handle's node, which drops its focus.
  useLayoutEffect(() => {
    if (focusAfterMove.current === null) return;
    handles.current[focusAfterMove.current]?.focus();
    focusAfterMove.current = null;
  });

  function move(from: number, to: number) {
    const item = items[from];
    if (to === from || item === undefined) return;
    setAnnouncement(`${itemName(item, from)} moved to position ${to + 1} of ${items.length}`);
    onMove(from, to);
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : -1;
    if (to < 0 || to >= items.length) return;
    event.preventDefault();
    focusAfterMove.current = to;
    move(index, to);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || items.length < 2) return;
    const centers: Point[] = [];
    for (const row of rows.current.slice(0, items.length)) {
      if (!row) return;
      const rect = row.getBoundingClientRect();
      centers.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }

    event.preventDefault();
    // Focus moves as on a click, so an input being edited still blurs (and commits).
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      from: index,
      over: index,
      dx: 0,
      dy: 0,
      pointer: { x: event.clientX, y: event.clientY },
      centers,
    });
  }

  function onPointerMove(event: PointerEvent) {
    const own = drag?.centers[drag.from];
    if (!drag || !own) return;
    const dx = event.clientX - drag.pointer.x;
    const dy = event.clientY - drag.pointer.y;
    const at = { x: own.x + dx, y: own.y + dy };
    let over = drag.from;
    let best = Number.POSITIVE_INFINITY;
    drag.centers.forEach((center, i) => {
      const distance = (center.x - at.x) ** 2 + (center.y - at.y) ** 2;
      if (distance < best) {
        best = distance;
        over = i;
      }
    });
    setDrag({ ...drag, dx, dy, over });
  }

  function endDrag(drop: boolean) {
    if (!drag) return;
    setDrag(null);
    if (drop) move(drag.from, drag.over);
  }

  function offset(index: number): Point {
    if (!drag) return { x: 0, y: 0 };
    if (index === drag.from) return { x: drag.dx, y: drag.dy };
    const step =
      drag.from < index && index <= drag.over
        ? -1
        : drag.over <= index && index < drag.from
          ? 1
          : 0;
    const own = drag.centers[index];
    const target = drag.centers[index + step];
    return own && target ? { x: target.x - own.x, y: target.y - own.y } : { x: 0, y: 0 };
  }

  return (
    <>
      <div className={cn("empty:hidden", className)}>
        {items.map((item, index) => {
          const dragging = drag?.from === index;
          const { x, y } = offset(index);
          const name = itemName(item, index);
          const handle = (
            <button
              type="button"
              ref={(el) => {
                handles.current[index] = el;
              }}
              aria-label={`Move ${name}`}
              aria-keyshortcuts="ArrowUp ArrowDown"
              className={cn(
                "-ml-2 grid h-10 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-8 [&_svg]:size-4.5",
                dragging && "cursor-grabbing",
              )}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerDown={(event) => onPointerDown(event, index)}
              onPointerMove={onPointerMove}
              onPointerUp={() => endDrag(true)}
              onPointerCancel={() => endDrag(false)}
              onLostPointerCapture={() => endDrag(false)}
            >
              <GripVerticalIcon strokeWidth={2.4} />
            </button>
          );

          return (
            <div
              key={getKey(item)}
              ref={(el) => {
                rows.current[index] = el;
              }}
              data-dragging={dragging || undefined}
              className="relative data-dragging:z-10 data-dragging:[&_[data-slot=field-box]]:shadow-[0_10px_24px_-10px_rgb(0_0_0/0.35)]"
              style={
                drag
                  ? {
                      transform: `translate(${x}px, ${y}px)`,
                      transition: dragging ? "none" : "transform 150ms ease",
                    }
                  : undefined
              }
            >
              {renderItem(item, index, handle)}
            </div>
          );
        })}
      </div>
      <output className="sr-only">{announcement}</output>
    </>
  );
}
