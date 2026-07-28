import { RecordsProvider, SortedRecordsProvider } from "@repo/client";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";

export default function AppLayout() {
  const primary = useCSSVariable("--color-primary") as string;
  const mutedForeground = useCSSVariable("--color-muted-foreground") as string;

  return (
    <RecordsProvider>
      <SortedRecordsProvider>
        <NativeTabs
          minimizeBehavior="onScrollDown"
          tintColor={primary}
          iconColor={{ default: mutedForeground, selected: primary }}
          labelStyle={{
            default: { color: mutedForeground },
            selected: { color: primary },
          }}
        >
          <NativeTabs.Trigger name="(records)">
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="gear" md="settings" />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="(search)" role="search">
            <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </SortedRecordsProvider>
    </RecordsProvider>
  );
}
