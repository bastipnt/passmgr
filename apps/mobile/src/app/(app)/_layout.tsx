import { RecordsProvider, SortedRecordsProvider } from "@repo/client";
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <RecordsProvider>
      <SortedRecordsProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SortedRecordsProvider>
    </RecordsProvider>
  );
}
