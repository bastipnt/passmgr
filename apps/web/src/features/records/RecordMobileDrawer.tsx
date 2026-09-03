import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { lazy, Suspense } from "react";
import { recordPaths } from "@/app/route-paths";
import { RecordActions } from "./RecordActions";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

const Record = lazy(() => import("./Record"));

type RecordMobileDrawerInnerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpenChangeComplete: (nextOpen: boolean) => void;
  recordId: string;
};

export function RecordMobileDrawerInner({
  onOpenChangeComplete,
  open,
  recordId,
  setOpen,
}: RecordMobileDrawerInnerProps) {
  const { record, ready, deleteRecord } = useRecordActions({ recordId });

  if (!ready) return null; // TODO: should be a fallback
  if (!record) return null;

  return (
    <Drawer open={open} onOpenChange={setOpen} onOpenChangeComplete={onOpenChangeComplete}>
      <DrawerPopup>
        <DrawerActions>
          <RecordActions
            recordId={recordId}
            title={record.title}
            onDelete={() => deleteRecord(recordId)}
            onSetOpen={setOpen}
          />
        </DrawerActions>
        <DrawerContent className="px-4">
          <Suspense fallback={null}>{recordId && <Record record={record} />}</Suspense>
        </DrawerContent>
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
