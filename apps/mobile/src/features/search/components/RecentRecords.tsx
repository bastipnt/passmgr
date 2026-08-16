import type { DecryptedRecord } from "@repo/schema";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

type RecentRecordsProps = {
  records: DecryptedRecord[];
  onOpen: (recordId: string) => void;
  onClear: () => void;
};

export function RecentRecords({ records, onOpen, onClear }: RecentRecordsProps) {
  const router = useRouter();

  return (
    <View>
      <View className="flex-row items-center justify-between bg-muted pr-md">
        <View className="flex-1">
          <RecordGroupLabel text="Recent" />
        </View>
        <Pressable onPress={onClear} hitSlop={8}>
          <Text className="font-semibold text-muted-foreground text-xs uppercase">Clear</Text>
        </Pressable>
      </View>

      <View className="overflow-hidden rounded-lg">
        {records.map((record) => (
          <RecordListItem
            key={record.recordId}
            title={record.title}
            username={record.username}
            websites={record.websites}
            onClick={() => {
              onOpen(record.recordId);
              router.navigate(`/${record.recordId}`);
            }}
          />
        ))}
      </View>
    </View>
  );
}
