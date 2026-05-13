import { useParams } from "wouter";
import { type LoginItem } from "@repo/schema";
import { LoginRecordFields } from "@features/login-record/components/LoginRecordFields";
import { Fallback } from "@features/record/components/Fallback";
import { useRecordActions } from "@features/record/hooks/actionsHook";
import EditRecord from "@features/record/components/EditRecord";

type RecordProps = {
  entryId: string;
};

// TODO: rename entryId
function RecordInner({ entryId }: RecordProps) {
  const {
    handleEditSheetChange,
    deleteItem,
    copyField,
    handleSubmit,
    data,
    ready,
    isEditSheetOpen,
    updateItemError,
  } = useRecordActions({
    entryId,
  });

  if (!ready || !data) return <Fallback />;

  const defaultValues: Partial<LoginItem> = {
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
        serverError={updateItemError?.message}
        onSubmit={handleSubmit}
        onDelete={() => deleteItem(entryId)}
      />
    </div>
  );
}

export default function Record({ entryId: entryIdProp }: { entryId?: string } = {}) {
  const params = useParams();
  const entryId = entryIdProp ?? params.entryId;
  if (!entryId) return <Fallback />;

  return <RecordInner entryId={entryId} />;
}
