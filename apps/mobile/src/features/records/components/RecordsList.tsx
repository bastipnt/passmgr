import { RecordGroup, useSortedRecords } from "@repo/client";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { YGroup } from "tamagui";

type RecordGroupProps = {
  recordGroup: RecordGroup;
  activeRecordId: string;
};

function RecordGroupLI({ recordGroup, activeRecordId }: RecordGroupProps) {
  const router = useRouter();

  return (
    <YGroup.Item>
      {recordGroup.label && <RecordGroupLabel text={recordGroup.label} />}
      <YGroup>
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
      </YGroup>
    </YGroup.Item>
  );
}

export function RecordsList() {
  const { recordGroups } = useSortedRecords();

  return (
    <YGroup>
      {recordGroups.map((recordGroup) => (
        <RecordGroupLI
          key={recordGroup.label ?? "all"}
          recordGroup={recordGroup}
          activeRecordId={"TODO:"}
        />
      ))}
    </YGroup>
  );
}
