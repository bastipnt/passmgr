import {
  alignFieldSpecs,
  type DiffStatus,
  getLoginFieldSpecs,
  type LoginFieldSpec,
  useRecordHistory,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Skeleton } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { Text, View } from "react-native";
import LoginFieldDisplay from "./LoginFieldDisplay";

const CARD_CLASS: Record<DiffStatus, string> = {
  unchanged: "border-border",
  edited: "border-warning",
  added: "border-success bg-success/10",
  removed: "border-error bg-error/10",
};

const STATUS_LABEL: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "Changed",
  added: "Added",
  removed: "Removed",
};

const STATUS_LABEL_CLASS: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "text-warning",
  added: "text-success",
  removed: "text-error",
};

/** One revision's value for a field. Copying from history is not offered. */
function DiffCard({
  spec,
  status,
  caption,
}: {
  spec: LoginFieldSpec;
  status: DiffStatus;
  caption?: string;
}) {
  return (
    <View className="gap-xs">
      {caption && <Text className="text-muted-foreground text-xs">{caption}</Text>}
      <View className={`overflow-hidden rounded-lg border ${CARD_CLASS[status]}`}>
        <LoginFieldDisplay spec={spec} />
      </View>
    </View>
  );
}

function VersionHeading({ record, isLatest }: { record: DecryptedRecord; isLatest: boolean }) {
  return (
    <View className="gap-xs">
      <Text className="font-semibold text-foreground text-sm">
        {isLatest ? "Current version" : `Version ${record.version}`}
      </Text>
      <Text className="text-muted-foreground text-xs">
        {toLocalDateStr(record.clientUpdatedAt)}
      </Text>
    </View>
  );
}

type VersionDetailProps = {
  recordId: string;
  version: number;
};

export default function VersionDetail({ recordId, version }: VersionDetailProps) {
  const { versions, ready } = useRecordHistory(recordId);
  const record = ready ? versions.find((v) => v.version === version) : undefined;
  const latestRecord = ready ? versions[0] : undefined;

  if (!ready) return <Skeleton height={160} />;
  if (!record) {
    return <Text className="text-muted-foreground text-sm">This version no longer exists.</Text>;
  }
  if (!latestRecord) {
    return <Text className="text-muted-foreground text-sm">This record no longer exists.</Text>;
  }

  const rows = alignFieldSpecs(
    getLoginFieldSpecs(record, { includeTitle: true }),
    getLoginFieldSpecs(latestRecord, { includeTitle: true }),
  );

  return (
    <View className="gap-lg">
      <View className="flex-row justify-between gap-md">
        <VersionHeading record={record} isLatest={false} />
        <VersionHeading record={latestRecord} isLatest />
      </View>

      {rows.map((row) => (
        <View key={`${row.status}:${row.key}`} className="gap-sm">
          {STATUS_LABEL[row.status] !== "" && (
            <Text className={`font-semibold text-xs ${STATUS_LABEL_CLASS[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </Text>
          )}

          {/* Unchanged rows show the value once — repeating it either side
              would be noise in a single column. */}
          {row.status === "unchanged"
            ? row.latest && <DiffCard spec={row.latest} status={row.status} />
            : [
                row.old && (
                  <DiffCard key="old" spec={row.old} status={row.status} caption="Before" />
                ),
                row.latest && (
                  <DiffCard key="latest" spec={row.latest} status={row.status} caption="Now" />
                ),
              ]}
        </View>
      ))}
    </View>
  );
}
