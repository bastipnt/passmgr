import {
  RECORD_TYPE_LABELS,
  recordFormDefaults,
  ShortcutLayer,
  useRecordVault,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import {
  ResponsiveSheet,
  SheetFormBar,
  SheetMediaHeader,
} from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { toLocalDateStr } from "@repo/util";
import { TrashIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import { RecordAvatar } from "./RecordAvatar";
import RecordForm, { type RecordFormHandle } from "./RecordForm";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

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

  const saveButton = (label: string, className?: string) => (
    <Button
      size="lg"
      className={className}
      disabled={updatePending}
      onClick={() => formRef.current?.triggerSubmit()}
    >
      {label}
      {updatePending && <Spinner data-icon="inline-end" />}
    </Button>
  );

  const form = (
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
            <p className="text-muted-foreground text-xs">Every save keeps a version</p>
          </div>
        )
      }
      ref={formRef}
    />
  );

  const formActions = (
    <div className="flex flex-row items-center justify-between gap-3">
      {deleteAction(
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
      <div className="flex flex-row items-center gap-3">
        <span className="hidden text-muted-foreground text-xs md:inline">
          Every save keeps a version
        </span>
        <Button variant="outline" size="lg" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {saveButton("Save changes")}
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
        title={`Edit ${noun}`}
        description={`${record.title} · last changed ${changedOn}`}
        media={<RecordAvatar record={record} />}
        actions={
          isMobile ? (
            <SheetFormBar title={`Edit ${noun}`} action={saveButton("Save", "rounded-full px-5")} />
          ) : (
            formActions
          )
        }
      >
        {form}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
