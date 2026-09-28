import { SessionContext } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { Drawer, DrawerPopup, DrawerTitle } from "@repo/ui/components/Drawer";
import Link from "@repo/ui/components/Link";
import { useScrollCollapse } from "@repo/ui/hooks/use-scroll-collapse";
import { cn } from "@repo/ui/lib/utils";
import { ChevronLeftIcon, CopyIcon, ExternalLinkIcon, PencilLineIcon } from "lucide-react";
import { lazy, Suspense, useContext, useLayoutEffect, useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import ShellBackdrop from "@/components/ShellBackdrop";
import { MoreDropdown } from "./RecordActions";
import { displayHost, useCopyField } from "./record-utils";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";
import { WebsiteAvatar } from "./WebsiteAvatar";

const Record = lazy(() => import("./Record"));

type MobileRecordScreenProps = {
  record: DecryptedRecord;
  onBack: () => void;
  onDelete: () => void;
};

/**
 * A record as a pushed page: floating back/edit/more over the content, the
 * fields full-bleed, and the action you open a login for — copying its
 * password — in a bottom dock. The large title scrolls up into the bar
 * between back and edit, shrinking as it goes; avatar and website scroll away.
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
    <div
      className={
        hasDock
          ? "relative isolate min-h-full pb-[calc(max(env(safe-area-inset-bottom),1rem)+5.5rem)]"
          : "relative isolate min-h-full pb-[max(env(safe-area-inset-bottom),1rem)]"
      }
    >
      <ShellBackdrop />
      <header className="sticky-bar z-20 flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Button variant="floating" size="icon-lg" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon className="size-5" />
        </Button>
        <span className="flex-1" />
        {!isOffline && (
          <div ref={actionsRef} className="flex items-center gap-2">
            <Link
              variant="floating"
              size="lg"
              className="h-10 px-4 text-[0.95rem]"
              href={recordPaths.editRecord(record.recordId)}
            >
              <PencilLineIcon />
              Edit
            </Link>
            <MoreDropdown recordId={record.recordId} onDelete={onDelete} variant="floating" />
          </div>
        )}
      </header>

      {/* Sticky as a direct child of the page, so it can pin inside the bar,
          vertically centered on its buttons. It collapses over the scroll that
          carries it from its hero spot (next to the avatar, 1rem under the bar;
          centered on the avatar when there's no website line) up to there:
          3.125rem + that gap. Margins/size interpolate hero → bar. */}
      <DrawerTitle
        ref={titleRef}
        className={cn(
          "scroll-collapse pointer-events-none sticky top-[calc(max(env(safe-area-inset-top),0.75rem)+0.5rem)] z-30 h-9 truncate font-display font-extrabold leading-9 tracking-tight",
          "ms-[calc(5.625rem-1.625rem*var(--scroll-collapse))] me-[calc(1.25rem+(var(--title-end,1rem)-1.25rem)*var(--scroll-collapse))] text-[calc(1.75rem-0.6875rem*var(--scroll-collapse))]",
          primaryWebsite
            ? "mt-4 [--scroll-collapse-range:4.125rem]"
            : "mt-6.5 [--scroll-collapse-range:4.75rem]",
        )}
      >
        {record.title}
      </DrawerTitle>

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

      <div className="relative px-4 pt-2">
        <Suspense fallback={null}>
          <Record record={record} />
        </Suspense>
      </div>

      {hasDock && (
        <div className="fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),1rem)] z-20 flex items-center gap-2.5">
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

type RecordMobileDrawerInnerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpenChangeComplete: (nextOpen: boolean) => void;
  recordId: string;
};

function RecordMobileDrawerInner({
  onOpenChangeComplete,
  open,
  recordId,
  setOpen,
}: RecordMobileDrawerInnerProps) {
  const { record, ready, deleteRecord } = useRecordActions({ recordId });

  if (!ready) return null; // TODO: should be a fallback
  if (!record) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={onOpenChangeComplete}
      swipeDirection="right"
    >
      <DrawerPopup side="right" className="bg-background! shadow-none">
        <MobileRecordScreen
          record={record}
          onBack={() => setOpen(false)}
          onDelete={() => deleteRecord(recordId)}
        />
      </DrawerPopup>
    </Drawer>
  );
}

export default function RecordMobileDrawer() {
  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<{ recordId: string }>(
    recordPaths.detailAny,
    () => recordPaths.index,
  );
  const recordId = params?.recordId;
  if (!recordId) return null;

  return (
    <RecordMobileDrawerInner
      recordId={recordId}
      open={open}
      onOpenChangeComplete={onOpenChangeComplete}
      setOpen={setOpen}
    />
  );
}
