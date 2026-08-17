import { useParams } from "wouter";
import Record from "./Record";
import { RecordActions } from "./RecordActions";
import { useRecordActions } from "./use-record-actions";

type ActionsProps = {
  recordId: string;
};

function Actions({ recordId }: ActionsProps) {
  const { handleEditSheetChange, deleteRecord, record, ready } = useRecordActions({
    recordId,
  });

  if (!ready || !record) return null;

  return (
    <RecordActions
      className="pb-10"
      title={record.title}
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
