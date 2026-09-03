import { Redirect, useParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import Record from "./Record";
import { RecordActions } from "./RecordActions";
import { RecordFallback } from "./RecordFallback";
import { useRecordActions, useRecordShortcuts } from "./use-record-actions";

function RecordScreen({ recordId }: { recordId: string }) {
  useRecordShortcuts({ recordId });

  const { deleteRecord, record, ready } = useRecordActions({ recordId });

  if (!ready) return <RecordFallback />;
  if (!record) return <Redirect to={recordPaths.index} replace />;

  return (
    <section className="p-4">
      <RecordActions
        className="pb-10"
        recordId={recordId}
        title={record.title}
        onDelete={() => deleteRecord(recordId)}
      />

      <Record record={record} />
    </section>
  );
}

export default function RecordPage() {
  const { recordId } = useParams();
  if (!recordId) return <Redirect to={recordPaths.index} replace />;

  return <RecordScreen recordId={recordId} />;
}
