import { RecordGroup } from "@repo/client";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";

type RecordGroupProps = {
  recordGroup: RecordGroup;
  activeRecordId: string;
};

function RecordGroupLI({ recordGroup, activeRecordId }: RecordGroupProps) {
  const router = useRouter();

  return (
    <View>
      {recordGroup.label && <RecordGroupLabel text={recordGroup.label} />}
      <View className="overflow-hidden rounded-lg">
        {recordGroup.records.map((record) => (
          <RecordListItem
            key={record.recordId}
            title={record.title}
            username={record.username}
            websites={record.websites}
            active={record.recordId === activeRecordId}
            // [recordId] lives in the (records,search) group, so the same href
            // resolves inside whichever tab is currently active.
            onClick={() => router.navigate(`/${record.recordId}`)}
          />
        ))}
      </View>
    </View>
  );
}

type RecordsListProps = {
  recordGroups: RecordGroup[];
};

export function RecordsList({ recordGroups }: RecordsListProps) {
  return (
    <View className="gap-md">
      {recordGroups.map((recordGroup) => (
        <RecordGroupLI
          key={recordGroup.label ?? "all"}
          recordGroup={recordGroup}
          activeRecordId={"TODO:"}
        />
      ))}
    </View>
  );
}
