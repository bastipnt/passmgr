import { RecordsProvider, SortedRecordsProvider } from "@repo/client";
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <RecordsProvider>
      <SortedRecordsProvider>
        <Stack>
          <Stack.Screen name="(records)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </SortedRecordsProvider>
    </RecordsProvider>
  );
}
