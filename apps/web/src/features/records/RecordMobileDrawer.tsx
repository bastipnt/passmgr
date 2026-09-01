import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { lazy, Suspense } from "react";
import { recordPaths } from "@/app/route-paths";
import { RecordActions } from "./RecordActions";
import { useRecordActions, useRecordShortcuts } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

const Record = lazy(() => import("./Record"));

type ActionsProps = {
  recordId: string;
  setOpen: (o: boolean) => void;
};

function Actions({ recordId, setOpen }: ActionsProps) {
  const { deleteRecord, record, ready } = useRecordActions({ recordId });
  useRecordShortcuts({ recordId });

  if (!ready || !record) return null;

  return (
    <DrawerActions>
      <RecordActions
        recordId={recordId}
        title={record.title}
        onDelete={() => deleteRecord(recordId)}
        onSetOpen={setOpen}
      />
    </DrawerActions>
  );
}

export function RecordMobileDrawer() {
  // Loose match: the drawer stays open while a sub-route sheet is layered on it.
  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<{ recordId: string }>(
    recordPaths.detailAny,
    () => recordPaths.index,
  );
  const recordId = params?.recordId;

  return (
    <Drawer open={open} onOpenChange={setOpen} onOpenChangeComplete={onOpenChangeComplete}>
      <DrawerPopup>
        {recordId && <Actions recordId={recordId} setOpen={setOpen} />}
        <DrawerContent className="px-4">
          <Suspense fallback={null}>{recordId && <Record recordId={recordId} />}</Suspense>
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  );
}
