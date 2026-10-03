import {
  alignFieldSpecs,
  type DiffStatus,
  type FieldSpec,
  getRecordFieldSpecs,
  useRecordHistory,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Skeleton } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { Text, View } from "react-native";
import LoginFieldDisplay from "./LoginFieldDisplay";

const CARD_CLASS: Record<DiffStatus, string> = {
  unchanged: "border-foreground/10 bg-white/60 dark:border-white/10 dark:bg-white/3",
  edited: "border-warning/45 bg-warning/10",
  added: "border-success/35 bg-success/10",
  removed: "border-destructive/30 bg-destructive/10",
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
  removed: "text-destructive",
};

/** One revision's value for a field. Copying from history is not offered. */
function DiffCard({
  spec,
  status,
  caption,
}: {
  spec: FieldSpec;
  status: DiffStatus;
  caption?: string;
}) {
  return (
    <View className="gap-1">
      {caption && <Text className="text-muted-foreground text-xs">{caption}</Text>}
      <View className={`overflow-hidden rounded-2xl border ${CARD_CLASS[status]}`}>
        <LoginFieldDisplay spec={spec} />
      </View>
    </View>
  );
}

function VersionHeading({ record, isCurrent }: { record: DecryptedRecord; isCurrent: boolean }) {
  return (
    <View className="gap-1">
      <Text className="font-semibold text-foreground text-sm">
        {isCurrent ? "Current version" : `Version ${record.version}`}
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

  if (!ready) return <Skeleton height={160} />;

  // Newest first, so the revision this one replaced sits right after it.
  const index = versions.findIndex((v) => v.version === version);
  const record = versions[index];
  const previousRecord = versions[index + 1];

  if (!record) {
    return <Text className="text-muted-foreground text-sm">This version no longer exists.</Text>;
  }
  if (!previousRecord) {
    return (
      <Text className="text-muted-foreground text-sm">
        This is the first version, there is nothing earlier to compare it with.
      </Text>
    );
  }

  const rows = alignFieldSpecs(
    getRecordFieldSpecs(previousRecord, { includeTitle: true }),
    getRecordFieldSpecs(record, { includeTitle: true }),
  );

  return (
    <View className="gap-6">
      <View className="flex-row justify-between gap-4">
        <VersionHeading record={previousRecord} isCurrent={false} />
        <VersionHeading record={record} isCurrent={index === 0} />
      </View>

      {rows.map((row) => (
        <View key={`${row.status}:${row.key}`} className="gap-2">
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
                  <DiffCard key="latest" spec={row.latest} status={row.status} caption="After" />
                ),
              ]}
        </View>
      ))}
    </View>
  );
}
