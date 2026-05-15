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
    data,
    ready,
    isEditSheetOpen,
    updateRecordError,
  } = useRecordActions({
    recordId,
  });

  if (!ready || !data) return <Fallback />;

  const defaultValues: Partial<LoginRecord> = {
    title: data.title,
    username: data.username,
    password: data.password,
    totp: data.totp,
    websites: data.websites,
    note: data.note,
    extraFields: data.extraFields,
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <LoginRecordFields data={data} onCopy={copyField} />

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
