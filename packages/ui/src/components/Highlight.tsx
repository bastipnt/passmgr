import { cn } from "@repo/ui/lib/utils";

type HighlightProps = {
  text: string;
  /** `[start, end)` of `text` to mark; none renders it plain. */
  range?: { start: number; end: number };
  className?: string;
};

export function Highlight({ text, range, className }: HighlightProps) {
  if (!range) return text;
  return (
    <>
      {text.slice(0, range.start)}
      <mark
        className={cn("rounded-[3px] bg-primary/15 text-inherit dark:bg-primary/30", className)}
      >
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  );
}
