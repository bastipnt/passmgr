import { getRecordWebsites, hasEditForm } from "@repo/client";
import { Redirect, useParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { PanelHeader } from "@/components/AppShell";
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
    <section>
      <PanelHeader className="block px-6 pt-6 pb-5 lg:px-7 lg:pt-7">
        <RecordActions
          recordId={recordId}
          title={record.title}
          websites={getRecordWebsites(record)}
          editable={hasEditForm(record)}
          onDelete={() => deleteRecord(recordId)}
        />
      </PanelHeader>

      <div className="px-6 pt-2 pb-6 lg:px-7 lg:pb-7">
        <Record record={record} />
      </div>
    </section>
  );
}

export default function RecordPage() {
  const { recordId } = useParams();
  if (!recordId) return <Redirect to={recordPaths.index} replace />;

  return <RecordScreen recordId={recordId} />;
}
