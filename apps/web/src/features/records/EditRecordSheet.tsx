import { ShortcutLayer } from "@repo/client";
import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { TrashIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import LoginRecordForm, { type LoginRecordFormHandle } from "./login/LoginRecordForm";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

export default function EditRecordSheet({ record }: { record: DecryptedRecord }) {
  const isMobile = useIsMobile();
  const formRef = useRef<LoginRecordFormHandle>(null);

  const { open, setOpen, onOpenChangeComplete } = useRouteSheet<{ recordId: string }>(
    recordPaths.edit,
    (p) => recordPaths.record(p.recordId),
  );

  const { deleteRecord, handleSubmit, updateRecordError } = useRecordActions({
    recordId: record.recordId,
    actionCb: () => setOpen(false),
  });

  const defaultValues: Partial<LoginRecord> = {
    title: record.title,
    username: record.username,
    password: record.password,
    totp: record.totp,
    websites: record.websites,
    note: record.note,
    extraFields: record.extraFields,
  };

  const form = (
    <LoginRecordForm
      onSubmit={handleSubmit}
      onCancel={() => setOpen(false)}
      serverError={updateRecordError?.message}
      defaultValues={defaultValues}
      action="Save"
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
        variant={isMobile ? "destructive" : "ghost-destructive"}
        type="button"
        className="text-destructive"
      >
        <TrashIcon /> Delete
      </Button>
    </RemoveDialog>
  );

  const formActions = (
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
      <div className="flex flex-row gap-4 sm:w-full sm:justify-between">
        {!isMobile && deleteAction}
        <div className="flex flex-row gap-4">
          {!isMobile && (
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
          <Button onClick={() => formRef.current?.triggerSubmit()}>Save</Button>
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
        title="Edit Login"
        actions={formActions}
      >
        {form}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
