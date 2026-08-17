import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { RecordActions } from "./RecordActions";
import { useRecordActions } from "./use-record-actions";

const Record = lazy(() => import("./Record"));

type ActionsProps = {
  recordId: string;
  setOpen: (o: boolean) => void;
};

function Actions({ recordId, setOpen }: ActionsProps) {
  const { handleEditSheetChange, deleteRecord, record, ready } = useRecordActions({
    recordId,
  });

  if (!ready || !record) return null;

  return (
    <DrawerActions>
      <RecordActions
        title={record.title}
        onEdit={() => handleEditSheetChange(true)}
        onDelete={() => deleteRecord(recordId)}
        onSetOpen={setOpen}
      />
    </DrawerActions>
  );
}

export function RecordMobileDrawer() {
  const [match, params] = useRoute(recordPaths.detail);
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(match);
  const recordId = params?.recordId;

  useEffect(() => {
    setOpen(match);
  }, [match]);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(o) => {
        if (!o) navigate(recordPaths.index);
      }}
    >
      <DrawerPopup>
        {recordId && <Actions recordId={recordId} setOpen={setOpen} />}
        <DrawerContent className="px-4">
          <Suspense fallback={null}>{recordId && <Record recordId={recordId} />}</Suspense>
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  );
}
