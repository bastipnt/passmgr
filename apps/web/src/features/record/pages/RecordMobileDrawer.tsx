import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { entrySlug } from "../../../data/routes";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { RecordActions } from "@features/record/components/RecordActions";
import { useRecordActions } from "@features/record/hooks/actionsHook";

const Record = lazy(() => import("@features/record/components/Record"));

type ActionsProps = {
  entryId: string;
  setOpen: (o: boolean) => void;
};

function Actions({ entryId, setOpen }: ActionsProps) {
  const { handleEditSheetChange, deleteItem, data, ready } = useRecordActions({
    entryId,
  });

  if (!ready || !data) return null;

  return (
    <DrawerActions>
      <RecordActions
        title={data.title}
        onEdit={() => handleEditSheetChange(true)}
        onDelete={() => deleteItem(entryId)}
        onSetOpen={setOpen}
      />
    </DrawerActions>
  );
}

export function RecordMobileDrawer() {
  const [match, params] = useRoute(`/${entrySlug}/:entryId`);
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(match);
  const entryId = params?.entryId;

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
        {entryId && <Actions entryId={entryId} setOpen={setOpen} />}
        <DrawerContent>
          <Suspense fallback={null}>{entryId && <Record entryId={entryId} />}</Suspense>
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  );
}
