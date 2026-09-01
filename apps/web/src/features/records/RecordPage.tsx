import { useParams } from "wouter";
import Record from "./Record";
import { RecordActions } from "./RecordActions";
import { useRecordActions, useRecordShortcuts } from "./use-record-actions";

type ActionsProps = {
  recordId: string;
};

function Actions({ recordId }: ActionsProps) {
  const { deleteRecord, record, ready } = useRecordActions({ recordId });

  if (!ready || !record) return null;

  return (
    <RecordActions
      className="pb-10"
      recordId={recordId}
      title={record.title}
      onDelete={() => deleteRecord(recordId)}
    />
  );
}

function RecordScreen({ recordId }: { recordId: string }) {
  useRecordShortcuts({ recordId });

  return (
    <section className="p-4">
      <Actions recordId={recordId} />
      <Record />
    </section>
  );
}

export default function RecordPage() {
  const { recordId } = useParams();
  if (!recordId) return null;

  return <RecordScreen recordId={recordId} />;
}
