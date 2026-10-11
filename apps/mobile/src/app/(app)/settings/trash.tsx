import {
  getRecordSubtitle,
  getRecordWebsites,
  itemCount,
  type TrashedRecord,
  useTrash,
} from "@repo/client";
import { RecordListItem, Screen, SectionGroup, SettingsSection } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { Stack } from "expo-router";
import { Alert, ScrollView, Text } from "react-native";
import { useCSSVariable } from "uniwind";
import { RecordAvatar } from "@/features/records/components/RecordAvatar";

/**
 * Web's Settings → Trash: deleted items, newest first. A tap offers restore
 * or delete for good (with the history, on every device); read-only vaults'
 * items only show.
 */
export default function TrashScreen() {
  const { records, ready, restore, purge, emptyTrash, pending } = useTrash();
  const destructive = useCSSVariable("--color-destructive") as string;
  const purgeable = records.filter((record) => record.writable).length;

  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch {
      Alert.alert(failure, "Try again.");
    }
  }

  function confirmPurge(title: string, onConfirm: () => Promise<unknown>) {
    Alert.alert(title, "The history goes too, on every device. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete for good",
        style: "destructive",
        onPress: () => void run(onConfirm, "The trash couldn't be emptied."),
      },
    ]);
  }

  function openActions(record: TrashedRecord) {
    Alert.alert(record.title, undefined, [
      {
        text: "Restore",
        onPress: () => void run(() => restore(record), `${record.title} couldn't be restored.`),
      },
      {
        text: "Delete for good",
        style: "destructive",
        onPress: () =>
          confirmPurge(`Delete ${record.title} for good?`, () => purge([record.recordId])),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Empty",
              accessibilityLabel: "Empty trash",
              tintColor: destructive,
              disabled: pending || purgeable === 0,
              onPress: () => confirmPurge(`Delete ${itemCount(purgeable)} for good?`, emptyTrash),
            },
          ],
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <SettingsSection
          flush
          title="Deleted items"
          description="Items you delete stay here until you delete them for good."
        >
          {ready && records.length === 0 ? (
            <Text className="px-5 text-muted-foreground text-sm">Nothing here.</Text>
          ) : (
            <SectionGroup>
              {records.map((record, index) => (
                <RecordListItem
                  key={record.recordId}
                  first={index === 0}
                  title={record.title}
                  username={`${getRecordSubtitle(record) || "—"} · deleted ${toLocalDateStr(record.deletedAt)}`}
                  websites={getRecordWebsites(record)}
                  avatar={
                    record.type === "login" ? undefined : <RecordAvatar record={record} size="md" />
                  }
                  onClick={record.writable && !pending ? () => openActions(record) : undefined}
                />
              ))}
            </SectionGroup>
          )}
        </SettingsSection>
      </ScrollView>
    </Screen>
  );
}
