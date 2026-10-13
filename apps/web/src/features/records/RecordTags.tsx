import { useSortedRecords } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Badge } from "@repo/ui/components/Badge";
import { TagIcon } from "lucide-react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";

/** The record's tags; each shows the list of every record carrying it. */
export function RecordTags({ record }: { record: DecryptedRecord }) {
  const { showTag: filterByTag } = useSortedRecords();
  const [, navigate] = useLocation();
  if (!record.tags?.length) return null;

  function showTag(tag: string) {
    filterByTag(tag);
    navigate(recordPaths.index);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        Tags
      </h2>
      <ul className="flex flex-wrap gap-1.5 px-1">
        {record.tags.map((tag) => (
          <li key={tag}>
            <Badge
              variant="secondary"
              className="h-7 cursor-pointer px-3 text-sm hover:bg-secondary/80"
              render={
                <button
                  type="button"
                  aria-label={`Show items tagged ${tag}`}
                  onClick={() => showTag(tag)}
                />
              }
            >
              <TagIcon />
              {tag}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
