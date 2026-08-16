import { useParams } from "wouter";
import { type LoginRecord } from "@repo/schema";
import { LoginRecordFields } from "@features/login-record/components/LoginRecordFields";
import { Fallback } from "@features/record/components/Fallback";
import { useRecordActions } from "@features/record/hooks/use-record-actions";
import EditRecord from "@features/record/components/EditRecord";

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

  if (!ready || !record) return <Fallback />;

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
  if (!recordId) return <Fallback />;

  return <RecordInner recordId={recordId} />;
}
