import { useContext } from "react";
import { SessionContext } from "@repo/client";
import { Text, View } from "tamagui";
import { RecordsList } from "@/features/records/components/RecordsList";

export default function HomeScreen() {
  const { sessionId } = useContext(SessionContext);

  return (
    <View>
      <RecordsList />
      <Text>Logged in with sessionId: {sessionId}</Text>
    </View>
  );
}
