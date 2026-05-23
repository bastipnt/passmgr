import { useContext } from "react";
import { SessionContext } from "@repo/client";
import { Main, Text } from "tamagui";
import { RecordsList } from "@/features/records/components/RecordsList";

export default function HomeScreen() {
  const { sessionId } = useContext(SessionContext);

  return (
    <Main>
      <RecordsList />
      <Text>Logged in with sessionId: {sessionId}</Text>
    </Main>
  );
}
