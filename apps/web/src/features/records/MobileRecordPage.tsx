import { SessionContext } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import Link from "@repo/ui/components/Link";
import { useScrollCollapse } from "@repo/ui/hooks/use-scroll-collapse";
import { cn } from "@repo/ui/lib/utils";
import { ChevronLeftIcon, CopyIcon, ExternalLinkIcon, PencilLineIcon } from "lucide-react";
import { useContext, useLayoutEffect, useRef } from "react";
import { Redirect, useParams } from "wouter";
import { usePageBack } from "@/app/page-transitions";
import { recordPaths } from "@/app/route-paths";
import ShellBackdrop from "@/components/ShellBackdrop";
import Record from "./Record";
import { MoreDropdown } from "./RecordActions";
import { RecordFallback } from "./RecordFallback";
import { displayHost, useCopyField } from "./record-utils";
import { useRecordActions, useRecordShortcuts } from "./use-record-actions";
import { WebsiteAvatar } from "./WebsiteAvatar";

type MobileRecordScreenProps = {
  record: DecryptedRecord;
  onBack: () => void;
  onDelete: () => void;
};

/**
 * A record as a pushed page (`PageTransitions` slides it in): floating
 * back/edit/more over the content, the fields full-bleed, and the action you
 * open a login for — copying its password — in a bottom dock. The large title
 * scrolls up into the bar between back and edit, shrinking as it goes; avatar
 * and website scroll away.
 */
function MobileRecordScreen({ record, onBack, onDelete }: MobileRecordScreenProps) {
  const { isOffline } = useContext(SessionContext);
  const copyField = useCopyField();
  const primaryWebsite = record.websites?.find((website) => website.value)?.value;
  const hasDock = Boolean(record.password || primaryWebsite);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useScrollCollapse(titleRef);

  // The collapsed title ends before the bar's actions (px-4 + their width + gap-2).
  useLayoutEffect(() => {
    const title = titleRef.current;
    const actions = actionsRef.current;
    if (!title || !actions) return;
    const observer = new ResizeObserver(() => {
      title.style.setProperty("--title-end", `calc(1.5rem + ${actions.offsetWidth}px)`);
    });
    observer.observe(actions);
    return () => {
      observer.disconnect();
      title.style.removeProperty("--title-end");
    };
  }, [isOffline]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <ShellBackdrop />
      <header className="sticky-bar sticky-bar-edge z-20 flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Button variant="floating" size="icon-xl" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon className="size-5" />
        </Button>
        <span className="flex-1" />
        {!isOffline && (
          <div ref={actionsRef} className="flex items-center gap-2">
            <Link variant="floating" size="lg" href={recordPaths.editRecord(record.recordId)}>
              <PencilLineIcon />
              Edit
            </Link>
            <MoreDropdown recordId={record.recordId} onDelete={onDelete} variant="floating" />
          </div>
        )}
      </header>

      {/* Sticky as a direct child of the page, so it can pin inside the bar,
          vertically centered on its size-12 buttons ((3rem - h-9) / 2 = +0.375rem,
          as `MobileListTitle`). It collapses over the scroll that carries it
          from its hero spot (next to the avatar, 1rem under the 3.75rem bar;
          centered on the avatar when there's no website line) up to there:
          3.75rem - 0.375rem + that gap. Margins/size interpolate hero → bar. */}
      <h1
        ref={titleRef}
        className={cn(
          "scroll-collapse pointer-events-none sticky top-[calc(max(env(safe-area-inset-top),0.75rem)+0.75rem)] z-30 h-9 truncate font-display font-extrabold leading-9 tracking-tight",
          "ms-[calc(5.625rem-1.125rem*var(--scroll-collapse))] me-[calc(1.25rem+(var(--title-end,1rem)-1.25rem)*var(--scroll-collapse))] text-[calc(1.75rem-0.6875rem*var(--scroll-collapse))]",
          primaryWebsite
            ? "mt-4 [--scroll-collapse-range:4.375rem]"
            : "mt-6.5 [--scroll-collapse-range:5rem]",
        )}
      >
        {record.title}
      </h1>

      {/* Laid out under the title: the spacer takes the title's place. */}
      <div
        className={cn(
          "relative flex items-center gap-3.5 px-5 pb-2",
          primaryWebsite ? "-mt-9" : "-mt-[2.875rem]",
        )}
      >
        <WebsiteAvatar title={record.title} websites={record.websites} size="lg" />
        <div className="flex min-w-0 flex-col pt-9">
          {primaryWebsite && (
            <a
              href={primaryWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 text-muted-foreground text-sm"
            >
              {displayHost(primaryWebsite)}
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      <div className="relative flex-1 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Record record={record} />
      </div>

      {hasDock && (
        // Sticky, not fixed: see `MobileVault` on `DrawerProvider`'s containment.
        <div className="sticky bottom-[max(env(safe-area-inset-bottom),1rem)] z-20 mx-4 mb-[max(env(safe-area-inset-bottom),1rem)] flex items-center gap-2.5">
          {record.password && (
            <Button
              size="lg"
              className="h-14 flex-1 rounded-full bg-primary text-base"
              onClick={() => copyField(record.password, "Password")}
            >
              <CopyIcon className="size-5" />
              Copy password
            </Button>
          )}
          {primaryWebsite && (
            <Button
              variant="floating"
              size="fab"
              className={record.password ? undefined : "w-auto flex-1 gap-2 text-base"}
              nativeButton={false}
              render={
                <a
                  href={primaryWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open website"
                />
              }
            >
              <ExternalLinkIcon className="size-5" />
              {!record.password && "Open website"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MobileRecordPage() {
  const { recordId } = useParams();
  if (!recordId) return <Redirect to={recordPaths.index} replace />;

  return <MobileRecordLoader recordId={recordId} />;
}

function MobileRecordLoader({ recordId }: { recordId: string }) {
  useRecordShortcuts({ recordId });
  const { record, ready, deleteRecord } = useRecordActions({ recordId });
  const goBack = usePageBack(recordPaths.index);

  if (!ready) return <RecordFallback />;
  if (!record) return <Redirect to={recordPaths.index} replace />;

  return (
    <MobileRecordScreen record={record} onBack={goBack} onDelete={() => deleteRecord(recordId)} />
  );
}
