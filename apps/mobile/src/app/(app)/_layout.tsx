import { RecordsProvider, SortedRecordsProvider } from "@repo/client";
// import { Stack } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

export default function AppLayout() {
  return (
    <RecordsProvider>
      <SortedRecordsProvider>
        <NativeTabs>
          <NativeTabs.Trigger name="(records)">
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="gear" md="settings" />
          </NativeTabs.Trigger>
        </NativeTabs>

        {/* <Stack>
          <Stack.Screen name="(records)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack> */}
      </SortedRecordsProvider>
    </RecordsProvider>
  );
}
