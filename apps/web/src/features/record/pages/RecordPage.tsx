import Record from "@features/record/components/Record";
import { RecordActions } from "@features/record/components/RecordActions";
import { useRecordActions } from "@features/record/hooks/actionsHook";
import { useParams } from "wouter";

type ActionsProps = {
  entryId: string;
};

function Actions({ entryId }: ActionsProps) {
  const { handleEditSheetChange, deleteItem, data, ready } = useRecordActions({
    entryId,
  });

  if (!ready || !data) return null;

  return (
    <RecordActions
      className="pb-10"
      title={data.title}
      onEdit={() => handleEditSheetChange(true)}
      onDelete={() => deleteItem(entryId)}
    />
  );
}

export default function RecordPage() {
  const { entryId } = useParams();

  return (
    <section className="p-4">
      {entryId && <Actions entryId={entryId} />}
      <Record />
    </section>
  );
}
