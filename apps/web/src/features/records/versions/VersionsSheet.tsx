import { ShortcutLayer } from "@repo/client";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { recordPaths } from "@/app/route-paths";
import { useRouteSheet } from "../use-route-sheet";
import VersionDetail from "./VersionDetail";
import VersionList from "./VersionList";

type VersionsRouteParams = { recordId: string; version?: string };

export default function VersionsSheet() {
  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<VersionsRouteParams>(
    recordPaths.versions,
    (p) => recordPaths.record(p.recordId),
  );

  const recordId = params?.recordId;
  const version = params?.version ? Number(params.version) : undefined;

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onOpenChangeComplete}
        title={version ? `Version ${version}` : "Version history"}
        sheetClassName="sm:max-w-3xl!"
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
