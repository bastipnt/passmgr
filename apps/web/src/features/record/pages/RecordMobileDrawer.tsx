import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { recordSlug } from "../../../data/routes";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { RecordActions } from "@features/record/components/RecordActions";
import { useRecordActions } from "@features/record/hooks/use-record-actions";

const Record = lazy(() => import("@features/record/components/Record"));

type ActionsProps = {
  recordId: string;
  setOpen: (o: boolean) => void;
};

function Actions({ recordId, setOpen }: ActionsProps) {
  const { handleEditSheetChange, deleteRecord, data, ready } = useRecordActions({
    recordId,
  });

  if (!ready || !data) return null;

  return (
    <DrawerActions>
      <RecordActions
        title={data.title}
        onEdit={() => handleEditSheetChange(true)}
        onDelete={() => deleteRecord(recordId)}
        onSetOpen={setOpen}
      />
    </DrawerActions>
  );
}

export function RecordMobileDrawer() {
  const [match, params] = useRoute(`/${recordSlug}/:recordId`);
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
        if (!o) navigate("/");
      }}
    >
      <DrawerPopup>
        {recordId && <Actions recordId={recordId} setOpen={setOpen} />}
        <DrawerContent>
          <Suspense fallback={null}>{recordId && <Record recordId={recordId} />}</Suspense>
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  );
}
