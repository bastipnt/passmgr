import { useContext } from "react";
import { SessionContext } from "@repo/client";
import { Main, Text } from "tamagui";

export default function SettingsScreen() {
  const { sessionId } = useContext(SessionContext);

  return (
    <Main>
      <Text fontSize="$lg">Settings</Text>
      <Text>Logged in with sessionId: {sessionId}</Text>
    </Main>
  );
}
