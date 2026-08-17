import { type LoginRecord } from "@repo/schema";
import { useParams } from "wouter";
import EditRecord from "./EditRecord";
import { LoginRecordFields } from "./login/LoginRecordFields";
import { RecordFallback } from "./RecordFallback";
import { useRecordActions } from "./use-record-actions";

type RecordProps = {
  recordId: string;
};

function RecordInner({ recordId }: RecordProps) {
  const {
    handleEditSheetChange,
    deleteRecord,
    copyField,
    handleSubmit,
    record,
    ready,
    isEditSheetOpen,
    updateRecordError,
  } = useRecordActions({
    recordId,
  });

  if (!ready || !record) return <RecordFallback />;

  const defaultValues: Partial<LoginRecord> = {
    title: record.title,
    username: record.username,
    password: record.password,
    totp: record.totp,
    websites: record.websites,
    note: record.note,
    extraFields: record.extraFields,
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <LoginRecordFields record={record} onCopy={copyField} />

      <EditRecord
        open={isEditSheetOpen}
        onOpenChange={handleEditSheetChange}
        defaultValues={defaultValues}
        serverError={updateRecordError?.message}
        onSubmit={handleSubmit}
        onDelete={() => deleteRecord(recordId)}
      />
    </div>
  );
}

export default function Record({ recordId: recordIdProp }: { recordId?: string } = {}) {
  const params = useParams();
  const recordId = recordIdProp ?? params.recordId;
  if (!recordId) return <RecordFallback />;

  return <RecordInner recordId={recordId} />;
}
