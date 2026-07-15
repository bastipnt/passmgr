import { RecordGroup, useSortedRecords } from "@repo/client";
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
            onClick={() => router.navigate(`./${record.recordId}`)}
          />
        ))}
      </View>
    </View>
  );
}

export function RecordsList() {
  const { recordGroups } = useSortedRecords();

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
