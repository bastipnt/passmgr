import { ShortcutLayer } from "@repo/client";
import {
  ResponsiveSheet,
  SheetDrawerHeader,
  SheetIconAction,
} from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ChevronLeftIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { useRouteSheet } from "../use-route-sheet";
import VersionDetail, { VersionHeadings } from "./VersionDetail";
import VersionList from "./VersionList";

type VersionsRouteParams = { recordId: string; version?: string };

/** Back from a version to the list: a sheet action on phones, the header's leading button on desktop. */
function BackToList({ recordId }: { recordId: string }) {
  const isMobile = useIsMobile();
  const props = {
    "aria-label": "All versions",
    nativeButton: false,
    render: <Link href={recordPaths.recordVersions(recordId)} />,
  };
  return isMobile ? (
    <SheetIconAction {...props}>
      <ChevronLeftIcon />
    </SheetIconAction>
  ) : (
    <Button variant="outline" size="icon-lg" {...props}>
      <ChevronLeftIcon />
    </Button>
  );
}

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

  const sheetActions = (
    <div className="flex flex-col gap-4">
      <SheetDrawerHeader title={title} description={description}>
        {isDetail && <BackToList recordId={recordId} />}
      </SheetDrawerHeader>
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
        media={!isMobile && isDetail && <BackToList recordId={recordId} />}
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
