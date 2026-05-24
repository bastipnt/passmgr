import { useGetRecord } from "@repo/client";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "tamagui";

function Fallback() {
  return (
    <View>
      <Text>Fallback</Text>
    </View>
  );
}

type RecordProps = {
  recordId: string;
};

function RecordInner({ recordId }: RecordProps) {
  const { record, ready } = useGetRecord(recordId);

  if (!ready || !record) return <Fallback />;

  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <Text>Username: {record.username}</Text>
    </div>
  );
}

export default function Record({ recordId: recordIdProp }: { recordId?: string } = {}) {
  const params = useLocalSearchParams();
  const recordId = recordIdProp ?? params.recordId;
  if (!recordId || typeof recordId !== "string") return <Fallback />;

  return <RecordInner recordId={recordId} />;
}
