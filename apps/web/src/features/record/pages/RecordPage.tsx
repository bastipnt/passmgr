import Record from "@features/record/components/Record";
import { RecordActions } from "@features/record/components/RecordActions";
import { useRecordActions } from "@features/record/hooks/use-record-actions";
import { useParams } from "wouter";

type ActionsProps = {
  recordId: string;
};

function Actions({ recordId }: ActionsProps) {
  const { handleEditSheetChange, deleteRecord, data, ready } = useRecordActions({
    recordId,
  });

  if (!ready || !data) return null;

  return (
    <RecordActions
      className="pb-10"
      title={data.title}
      onEdit={() => handleEditSheetChange(true)}
      onDelete={() => deleteRecord(recordId)}
    />
  );
}

export default function RecordPage() {
  const { recordId } = useParams();

  return (
    <section className="p-4">
      {recordId && <Actions recordId={recordId} />}
      <Record />
    </section>
  );
}
