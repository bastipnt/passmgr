import { ShortcutLayer } from "@repo/client";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { DrawerDescription, DrawerTitle } from "@repo/ui/components/Drawer";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { useRouteSheet } from "../use-route-sheet";
import VersionDetail, { VersionHeadings } from "./VersionDetail";
import VersionList from "./VersionList";

type VersionsRouteParams = { recordId: string; version?: string };

export default function VersionsSheet() {
  const isMobile = useIsMobile();

  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<VersionsRouteParams>(
    recordPaths.versions,
    (p) => recordPaths.record(p.recordId),
  );

  const recordId = params?.recordId;
  // A malformed segment (`/versions/abc`) falls back to the list.
  const parsedVersion = Number(params?.version);
  const version = Number.isInteger(parsedVersion) ? parsedVersion : undefined;
  const isDetail = recordId !== undefined && version !== undefined;

  const title = isDetail ? `Version ${version}` : "Version history";
  const description = isDetail ? "Changes since the previous version" : undefined;

  const backToList = isDetail && (
    <Button
      variant="outline"
      size={isMobile ? "icon" : "icon-lg"}
      className={isMobile ? "rounded-full" : undefined}
      aria-label="All versions"
      nativeButton={false}
      render={<Link href={recordPaths.recordVersions(recordId)} />}
    >
      <ChevronLeftIcon />
    </Button>
  );

  const sheetActions = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => setOpen(false)}
        >
          <XIcon />
        </Button>
        {backToList}
        <div className="ml-1 flex min-w-0 flex-col">
          <DrawerTitle className="truncate font-bold font-display text-lg leading-6 tracking-[-0.02em]">
            {title}
          </DrawerTitle>
          {description && (
            <DrawerDescription className="truncate text-muted-foreground text-xs">
              {description}
            </DrawerDescription>
          )}
        </div>
      </div>
      {isDetail && <VersionHeadings recordId={recordId} version={version} />}
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onOpenChangeComplete}
        title={title}
        description={description}
        media={isMobile ? undefined : backToList}
        sheetClassName="sm:max-w-3xl!"
        actions={isMobile ? sheetActions : undefined}
      >
        {recordId &&
          (version === undefined ? (
            <VersionList recordId={recordId} />
          ) : (
            <VersionDetail recordId={recordId} version={version} />
          ))}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
