import { type LoginRecord } from "@repo/schema";
import { Redirect, useParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
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

  if (!ready) return <RecordFallback />;
  if (!record) return <Redirect to={recordPaths.index} replace />;

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
