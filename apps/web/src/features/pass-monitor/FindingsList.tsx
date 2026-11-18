import { Badge } from "@repo/ui/components/Badge";
import { Spinner } from "@repo/ui/components/Spinner";
import { cn } from "@repo/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { useId } from "react";
import { Link as WouterLink } from "wouter";
import type { Finding } from "./findings";
import { monitorCardClassName } from "./MonitorPage";

function FindingCount({ title, count, failed, off }: Finding) {
  if (off) return <Badge variant="outline">Off</Badge>;
  if (failed)
    return (
      <Badge variant="outline" aria-label={`${title} couldn't be checked`}>
        —
      </Badge>
    );
  if (count === undefined) return <Spinner aria-label={`Checking ${title.toLowerCase()}`} />;
  return (
    <Badge variant={count > 0 ? "warning" : "success"} aria-label={`${count} ${title}`}>
      {count}
    </Badge>
  );
}

/**
 * Every check with its count. `active`: the finding open beside it (desktop);
 * without, each row drills down to its page (phone).
 */
export function FindingsList({ findings, active }: { findings: Finding[]; active?: string }) {
  const headingId = useId();
  const drillDown = active === undefined;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.06em] max-sm:px-4"
      >
        Findings
      </h2>
      <nav aria-labelledby={headingId} className={monitorCardClassName}>
        {findings.map((finding) => {
          const current = finding.path === active;
          return (
            <WouterLink
              key={finding.path}
              href={finding.path}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-15 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-sm:min-h-14 max-sm:px-4.5",
                current && "bg-muted hover:bg-muted",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-sm max-sm:font-normal max-sm:text-base">
                  {finding.title}
                </span>
                <span className="text-[13px] text-muted-foreground leading-4.5">
                  {finding.description}
                </span>
              </span>
              <FindingCount {...finding} />
              {drillDown && (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
            </WouterLink>
          );
        })}
      </nav>
    </section>
  );
}
