import { ShortcutLayer } from "@repo/client";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { XIcon } from "lucide-react";
import { recordPaths } from "@/app/route-paths";
import { useRouteSheet } from "../use-route-sheet";
import VersionDetail from "./VersionDetail";
import VersionList from "./VersionList";

type VersionsRouteParams = { recordId: string; version?: string };

export default function VersionsSheet() {
  const isMobile = useIsMobile();

  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<VersionsRouteParams>(
    recordPaths.versions,
    (p) => recordPaths.record(p.recordId),
  );

  const recordId = params?.recordId;
  const version = params?.version ? Number(params.version) : undefined;

  const sheetActions = (
    <div className="flex flex-row justify-between gap-4">
      {isMobile && (
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => setOpen(false)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onOpenChangeComplete}
        title={version ? `Version ${version}` : "Version history"}
        sheetClassName="sm:max-w-3xl!"
        actions={sheetActions}
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
