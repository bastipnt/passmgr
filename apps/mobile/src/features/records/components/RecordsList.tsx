import { RecordGroup, useSortedRecords } from "@repo/client";
import { DecryptedRecord } from "@repo/schema";
import { Avatar, ListItem, ScrollView, Text, YGroup } from "tamagui";

type RecordLIProps = {
  record: DecryptedRecord;
  active: boolean;
};

function RecordLI({ record, active }: RecordLIProps) {
  return (
    <YGroup.Item>
      <ListItem
        background={active ? "$background" : "$accent10"}
        icon={
          <Avatar circular size="$3">
            <Avatar.Image src="/placeholder.png" />
            <Avatar.Fallback background="$accent0" />
          </Avatar>
        }
        title={record.title}
        subTitle={record.username || "-"}
        size="$4"
      />
    </YGroup.Item>
  );
}

type RecordGroupProps = {
  recordGroup: RecordGroup;
  activeRecordId: string;
};

function RecordGroupLI({ recordGroup, activeRecordId }: RecordGroupProps) {
  return (
    <YGroup.Item>
      <Text p="$2">{recordGroup.label}</Text>
      <YGroup>
        {recordGroup.records.map((record) => (
          <RecordLI
            key={record.recordId}
            record={record}
            active={record.recordId === activeRecordId}
          />
        ))}
      </YGroup>
    </YGroup.Item>
  );
}

export function RecordsList() {
  const { recordGroups } = useSortedRecords();

  return (
    <ScrollView>
      <YGroup>
        {recordGroups.map((recordGroup) => (
          <RecordGroupLI
            key={recordGroup.label ?? "all"}
            recordGroup={recordGroup}
            activeRecordId={"TODO:"}
          />
        ))}
      </YGroup>
    </ScrollView>
  );
}
