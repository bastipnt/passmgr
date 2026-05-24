import { RecordsProvider, SortedRecordsProvider } from "@repo/client";
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <RecordsProvider>
      <SortedRecordsProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="[recordId]"
            options={{
              headerShown: false,
              presentation: "formSheet",
              sheetCornerRadius: 24,
              sheetGrabberVisible: true,
            }}
          />
        </Stack>
      </SortedRecordsProvider>
    </RecordsProvider>
  );
}
