import type { DecryptedRecord } from "@repo/schema";
import { toLocalDateStr } from "@repo/util";
import { ChevronRightIcon, HistoryIcon } from "lucide-react";
import { Link as WouterLink } from "wouter";
import { recordPaths } from "@/app/route-paths";

/**
 * Version history link plus created/changed dates. A grouped row rather than
 * an inline footer, so it never wraps in a narrow detail pane.
 */
export function HistorySection({ record }: { record: DecryptedRecord }) {
  // Versions are numbered from 1, so the latest number is the count.
  const versionCount = record.version;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        History
      </h2>
      <WouterLink
        href={recordPaths.recordVersions(record.recordId)}
        className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-white/60 px-4 py-3 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 max-sm:bg-transparent max-sm:px-5 max-sm:active:bg-primary/8 max-sm:hover:bg-transparent dark:border-white/10 dark:bg-white/3 max-sm:dark:bg-transparent max-sm:dark:active:bg-foreground/5 dark:hover:bg-white/6"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/8 text-muted-foreground [&_svg]:size-3.5"
          aria-hidden
        >
          <HistoryIcon />
        </span>
        <span className="flex-1 font-semibold text-sm">Version history</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {versionCount} {versionCount === 1 ? "version" : "versions"}
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
      </WouterLink>
      <p className="px-1 text-muted-foreground text-xs">
        Created {toLocalDateStr(record.firstCreatedAt)} · Last changed{" "}
        {toLocalDateStr(record.clientUpdatedAt)}
      </p>
    </section>
  );
}
