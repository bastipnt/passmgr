import { SessionContext } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { Drawer, DrawerPopup, DrawerTitle } from "@repo/ui/components/Drawer";
import Link from "@repo/ui/components/Link";
import { ChevronLeftIcon, CopyIcon, ExternalLinkIcon, PencilLineIcon } from "lucide-react";
import { lazy, Suspense, useContext } from "react";
import { recordPaths } from "@/app/route-paths";
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
 * password — in a bottom dock.
 */
function MobileRecordScreen({ record, onBack, onDelete }: MobileRecordScreenProps) {
  const { isOffline } = useContext(SessionContext);
  const copyField = useCopyField();
  const primaryWebsite = record.websites?.find((website) => website.value)?.value;
  const hasDock = Boolean(record.password || primaryWebsite);

  return (
    <div
      className={
        hasDock
          ? "relative isolate min-h-full pb-[calc(max(env(safe-area-inset-bottom),1rem)+5.5rem)]"
          : "relative isolate min-h-full pb-[max(env(safe-area-inset-bottom),1rem)]"
      }
    >
      <div className="top-glow" aria-hidden />
      <header className="sticky top-0 z-20 flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Button variant="floating" size="icon-lg" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon className="size-5" />
        </Button>
        <span className="flex-1" />
        {!isOffline && (
          <>
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
          </>
        )}
      </header>

      <div className="relative flex items-center gap-3.5 px-5 pt-2 pb-2">
        <WebsiteAvatar title={record.title} websites={record.websites} size="lg" />
        <div className="flex min-w-0 flex-col gap-0">
          <DrawerTitle className="truncate font-display font-extrabold text-[1.75rem] leading-tight tracking-tight">
            {record.title}
          </DrawerTitle>
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
      <DrawerPopup side="right" className="bg-background shadow-none">
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
