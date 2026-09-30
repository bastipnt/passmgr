import type { DecryptedRecord } from "@repo/schema";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { recordPaths } from "@/route-paths";

type RecentRecordsProps = {
  records: DecryptedRecord[];
  onOpen: (recordId: string) => void;
  onClear: () => void;
};

export function RecentRecords({ records, onOpen, onClear }: RecentRecordsProps) {
  const router = useRouter();

  return (
    <View>
      <RecordGroupLabel
        text="Recent"
        action={
          <Pressable onPress={onClear} hitSlop={8}>
            <Text className="font-semibold text-primary text-sm">Clear</Text>
          </Pressable>
        }
      />
      {records.map((record, index) => (
        <RecordListItem
          key={record.recordId}
          first={index === 0}
          title={record.title}
          username={record.username}
          websites={record.websites}
          onClick={() => {
            onOpen(record.recordId);
            router.navigate(recordPaths.record(record.recordId));
          }}
        />
      ))}
    </View>
  );
}
