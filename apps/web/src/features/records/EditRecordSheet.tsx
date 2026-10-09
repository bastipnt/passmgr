import { RECORD_TYPE_LABELS, recordFormDefaults, ShortcutLayer } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ResponsiveSheet, SheetCloseAction } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { toLocalDateStr } from "@repo/util";
import { TrashIcon } from "lucide-react";
import { useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import { RecordAvatar } from "./RecordAvatar";
import RecordForm, { type RecordFormHandle } from "./RecordForm";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

export default function EditRecordSheet({ record }: { record: DecryptedRecord }) {
  const isMobile = useIsMobile();
  const formRef = useRef<RecordFormHandle>(null);

  const { open, setOpen, onOpenChangeComplete } = useRouteSheet<{ recordId: string }>(
    recordPaths.edit,
    (p) => recordPaths.record(p.recordId),
  );

  const { deleteRecord, handleSubmit, updateRecordError, updatePending } = useRecordActions({
    recordId: record.recordId,
    actionCb: () => setOpen(false),
  });

  const form = (
    <RecordForm
      type={record.type}
      onSubmit={handleSubmit}
      serverError={updateRecordError?.message}
      disabled={updatePending}
      defaultValues={recordFormDefaults(record)}
      ref={formRef}
    />
  );

  const deleteAction = (
    <RemoveDialog
      title="Delete record"
      description="Are you sure you want to delete this record? This action cannot be undone."
      removeTitle="Delete"
      onRemove={() => deleteRecord(record.recordId)}
    >
      <Button
        variant="ghost-destructive"
        size="lg"
        type="button"
        className="text-destructive"
        disabled={updatePending}
      >
        <TrashIcon /> Delete
      </Button>
    </RemoveDialog>
  );

  const formActions = (
    <div className="flex flex-row justify-between gap-4">
      <SheetCloseAction />
      <div className="flex flex-row items-center gap-3 sm:w-full sm:justify-between">
        {!isMobile && deleteAction}
        <div className="flex flex-row items-center gap-3">
          {!isMobile && (
            <>
              <span className="hidden text-muted-foreground text-xs md:inline">
                Every save keeps a version
              </span>
              <Button variant="outline" size="lg" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </>
          )}
          <Button
            size="lg"
            disabled={updatePending}
            onClick={() => formRef.current?.triggerSubmit()}
          >
            Save changes
            {updatePending && <Spinner data-icon="inline-end" />}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onOpenChangeComplete}
        sheetClassName="sm:max-w-3xl!"
        title={`Edit ${RECORD_TYPE_LABELS[record.type].noun}`}
        description={`${record.title} · last changed ${toLocalDateStr(record.clientUpdatedAt)}`}
        media={<RecordAvatar record={record} />}
        actions={formActions}
      >
        {form}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
