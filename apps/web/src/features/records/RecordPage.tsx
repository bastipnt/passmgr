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
    <section className="flex flex-col items-center px-8 pb-6">
      <div className="flex w-full max-w-160 flex-col gap-8">
        <RecordActions
          className="sticky-bar pt-6"
          record={record}
          onDelete={() => deleteRecord(recordId)}
        />
        <Record record={record} />
      </div>
    </section>
  );
}

export default function RecordPage() {
  const { recordId } = useParams();
  if (!recordId) return <Redirect to={recordPaths.index} replace />;

  return <RecordScreen key={recordId} recordId={recordId} />;
}
