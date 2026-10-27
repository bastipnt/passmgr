import { type RefObject, useLayoutEffect, useState } from "react";

const sizesToContent =
  typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content") === true;

/**
 * A box capped in height (by the caller, while not `expanded`) that can show its content
 * in full. `overflows` is measured on resize and whenever `content` changes; `onMeasure`
 * runs after each measurement. A textarea is sized to its content by hand where the
 * browser has no `field-sizing` (Firefox), so the cap and Expand still apply.
 */
export function useExpandable(
  ref: RefObject<HTMLElement | null>,
  { content, onMeasure }: { content?: unknown; onMeasure?: () => void } = {},
) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!sizesToContent && el instanceof HTMLTextAreaElement) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    // Expanded, nothing overflows; keep the last answer so the collapse toggle stays.
    if (expanded) return;
    const update = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
      onMeasure?.();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [ref, expanded, content, onMeasure]);

  const toggle = () => {
    if (expanded && ref.current) ref.current.scrollTop = 0;
    setExpanded(!expanded);
  };

  return { expanded, overflows, toggle };
}
