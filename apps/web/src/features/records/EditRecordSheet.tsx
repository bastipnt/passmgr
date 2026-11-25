import { RECORD_TYPE_LABELS, recordFormDefaults, useRecordVault, userMessage } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { SheetMediaHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { toLocalDateStr } from "@repo/util";
import { TrashIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { recordPaths } from "@/app/route-paths";
import { useOneShotParam } from "@/hooks/use-one-shot-param";
import { RecordAvatar } from "./RecordAvatar";
import { RecordFormFields, type RecordFormHandle, useRecordForm } from "./RecordForm";
import RecordFormSheet from "./RecordFormSheet";
import { useDiscardGuard } from "./use-discard-guard";
import { useRecordActions } from "./use-record-actions";
import { useRouteSheet } from "./use-route-sheet";

const VERSION_NOTE = "Every save keeps a version";

type RouteSheet = ReturnType<typeof useRouteSheet<{ recordId: string }>>;

/** Rendered above the phone / desktop page branch, so crossing 640px keeps the sheet and its input. */
export default function EditRecordSheet() {
  const sheet = useRouteSheet<{ recordId: string }>(recordPaths.edit, (p) =>
    recordPaths.record(p.recordId),
  );
  const recordId = sheet.params?.recordId;
  if (!recordId) return null;
  return <EditRecordSheetLoader key={recordId} recordId={recordId} sheet={sheet} />;
}

function EditRecordSheetLoader({ recordId, sheet }: { recordId: string; sheet: RouteSheet }) {
  const actions = useRecordActions({ recordId, actionCb: () => sheet.setOpen(false) });
  const { writable } = useRecordVault(actions.record);
  // A read member's edit would only be refused by the server (and parked).
  if (!actions.record || !writable) return null;
  return <EditRecordSheetContent record={actions.record} sheet={sheet} actions={actions} />;
}

function EditRecordSheetContent({
  record,
  sheet,
  actions,
}: {
  record: DecryptedRecord;
  sheet: RouteSheet;
  actions: ReturnType<typeof useRecordActions>;
}) {
  const isMobile = useIsMobile();
  const formRef = useRef<RecordFormHandle>(null);
  // Pass Monitor's "Change" asks for a new password right away.
  const generateRequested = useOneShotParam(recordPaths.generateParam);
  const { open, match, setOpen, onOpenChangeComplete } = sheet;
  const { deleteRecord, handleSubmit, updateRecordError, updatePending } = actions;

  const guard = useDiscardGuard({
    routeOpen: match,
    shown: open,
    isDirty: () => isDirty,
  });
  const { form, isDirty } = useRecordForm(record.type, recordFormDefaults(record), {
    open: guard.open,
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
      guard={guard}
      onClose={() => setOpen(false)}
      onOpenChangeComplete={onOpenChangeComplete}
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
      <RecordFormFields
        type={record.type}
        form={form}
        onSubmit={handleSubmit}
        serverError={updateRecordError ? userMessage(updateRecordError) : undefined}
        disabled={updatePending}
        openGenerator={generateRequested}
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
