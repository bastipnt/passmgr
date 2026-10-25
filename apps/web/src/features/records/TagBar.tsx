import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { buttonVariants } from "@repo/ui/components/Button";
import { TagPicker } from "@repo/ui/components/TagPicker";
import { TagPill } from "@repo/ui/components/TagPill";
import { cn } from "@repo/ui/lib/utils";
import { TagIcon } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * The tag filter as one row of pills: the selected ones first, then the rest
 * with how many records each would leave. It doesn't wrap; what overflows
 * fades out and is reached through "All N tags".
 */
export function TagBar() {
  const { tags, tagFilters, toggleTag, removeTag, clearTags } = useSortedRecords();
  const row = useRef<HTMLDivElement>(null);
  // A picked pill jumps to the start: follow it there, else it's scrolled out of view.
  useEffect(() => {
    if (row.current) row.current.scrollLeft = 0;
  }, [tagFilters]);
  if (tags.length === 0) return null;

  const selectedKeys = new Set(tagFilters.map(tagKey));
  const others = tags.filter(({ tag }) => !selectedKeys.has(tagKey(tag)));

  return (
    <fieldset aria-label="Tags" className="flex min-w-0 items-center gap-1.5 px-1">
      <span className="mr-1 flex shrink-0 items-center gap-1.5 font-semibold text-muted-foreground text-xs">
        <TagIcon aria-hidden className="size-4" />
        Tags
      </span>
      <div
        ref={row}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [mask-image:linear-gradient(90deg,#000_calc(100%-6rem),transparent)] [scrollbar-width:none]"
      >
        {tagFilters.map((tag) => (
          <TagPill key={tagKey(tag)} tag={tag} selected onClick={() => removeTag(tag)} />
        ))}
        {tagFilters.length > 0 && (
          <>
            <button
              type="button"
              onClick={clearTags}
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "px-1")}
            >
              Clear
            </button>
            <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-foreground/14" />
          </>
        )}
        {others.map(({ tag, count }) => (
          <TagPill
            key={tagKey(tag)}
            tag={tag}
            count={count}
            disabled={count === 0}
            onClick={() => toggleTag(tag)}
          />
        ))}
      </div>
      <TagPicker
        tags={tags}
        selected={tagFilters}
        onToggle={toggleTag}
        label={`All ${tags.length} tags`}
      />
    </fieldset>
  );
}
