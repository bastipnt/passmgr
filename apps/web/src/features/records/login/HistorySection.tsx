import type { DecryptedRecord } from "@repo/schema";
import { toLocalDateStr } from "@repo/util";
import { ChevronRightIcon, HistoryIcon } from "lucide-react";
import { Link as WouterLink } from "wouter";
import { recordPaths } from "@/app/route-paths";

/** The version count and dates, as a card that opens the versions sheet. */
export function HistorySection({ record }: { record: DecryptedRecord }) {
  // Versions are numbered from 1, so the latest number is the count.
  const versionCount = record.version;

  return (
    <WouterLink
      href={recordPaths.recordVersions(record.recordId)}
      className="group/history mt-1 flex items-center gap-3.5 rounded-2xl border border-foreground/10 bg-white/65 p-4 shadow-xs outline-none transition-colors hover:bg-white focus-visible:ring-4 focus-visible:ring-ring/25 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6"
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-text [&_svg]:size-4.5"
      >
        <HistoryIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-bold font-display text-[1.0625rem] tracking-[-0.015em]">
          Version history
        </span>
        <span className="text-muted-foreground text-sm">
          {versionCount} {versionCount === 1 ? "version" : "versions"} · last change{" "}
          {toLocalDateStr(record.clientUpdatedAt)} · created {toLocalDateStr(record.firstCreatedAt)}
        </span>
      </span>
      <span
        aria-hidden
        className="flex h-8.5 shrink-0 items-center gap-1 rounded-[0.625rem] border border-foreground/10 bg-white px-3 font-semibold text-sm group-hover/history:bg-foreground/3 max-sm:hidden dark:border-white/14 dark:bg-white/5"
      >
        View
        <ChevronRightIcon className="size-4" />
      </span>
      <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground sm:hidden" />
    </WouterLink>
  );
}
