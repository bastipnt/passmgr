import { RECORD_TYPE_LABELS, recordFormDefaults, useRecordVault } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { SheetMediaHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { toLocalDateStr } from "@repo/util";
import { TrashIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import { RecordAvatar } from "./RecordAvatar";
import RecordForm, { type RecordFormHandle } from "./RecordForm";
import RecordFormSheet from "./RecordFormSheet";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

const VERSION_NOTE = "Every save keeps a version";

export default function EditRecordSheet({ record }: { record: DecryptedRecord }) {
  const { writable } = useRecordVault(record);
  // A read member's edit would only be refused by the server (and parked).
  if (!writable) return null;
  return <EditRecordSheetContent record={record} />;
}

function EditRecordSheetContent({ record }: { record: DecryptedRecord }) {
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

  const noun = RECORD_TYPE_LABELS[record.type].noun;
  const changedOn = toLocalDateStr(record.clientUpdatedAt);

  const deleteAction = (button: ReactElement) => (
    <RemoveDialog
      title="Delete record"
      description="Are you sure you want to delete this record? This action cannot be undone."
      removeTitle="Delete"
      onRemove={() => deleteRecord(record.recordId)}
    >
      {button}
    </RemoveDialog>
  );

  return (
    <RecordFormSheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={onOpenChangeComplete}
      onCancel={() => setOpen(false)}
      title={`Edit ${noun}`}
      description={`${record.title} · last changed ${changedOn}`}
      media={<RecordAvatar record={record} size="header" />}
      submit={{
        label: "Save changes",
        phoneLabel: "Save",
        pending: updatePending,
        onClick: () => formRef.current?.triggerSubmit(),
      }}
      leading={deleteAction(
        <Button
          variant="ghost-destructive"
          size="lg"
          type="button"
          className="text-destructive"
          disabled={updatePending}
        >
          <TrashIcon /> Delete
        </Button>,
      )}
      footnote={VERSION_NOTE}
    >
      <RecordForm
        type={record.type}
        onSubmit={handleSubmit}
        serverError={updateRecordError?.message}
        disabled={updatePending}
        defaultValues={recordFormDefaults(record)}
        header={
          isMobile && (
            <SheetMediaHeader
              media={<RecordAvatar record={record} size="ml" />}
              title={record.title}
              description={`Last changed ${changedOn}`}
            />
          )
        }
        footer={
          isMobile && (
            <div className="flex flex-col items-center gap-2.5">
              {deleteAction(
                <Button variant="destructive" size="lg" type="button" className="w-full">
                  <TrashIcon /> Delete {noun}
                </Button>,
              )}
              <p className="text-muted-foreground text-xs">{VERSION_NOTE}</p>
            </div>
          )
        }
        ref={formRef}
      />
    </RecordFormSheet>
  );
}
