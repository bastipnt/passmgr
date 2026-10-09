import { useLastSyncedLabel, useSyncSummary } from "@repo/client";
import { Button, SettingsSection } from "@repo/ui-native";
import { Text, View } from "react-native";

/**
 * Sync with the account (ADR 0001 D8), for a linked profile: where it stands,
 * when it last went through, and the manual nudges (sync now, retry parked).
 */
export function SyncSection() {
  const { status, summary, canSync, syncNow, retryParked } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);

  return (
    <SettingsSection title="Sync" description={lastSynced ?? undefined}>
      <View className="gap-3">
        <View className="gap-1" accessibilityLiveRegion="polite">
          <Text className="text-[16px] text-foreground">{summary.title}</Text>
          <Text className="text-muted-foreground text-sm">{summary.detail}</Text>
        </View>
        {status.parked > 0 && (
          <Button size="lg" onPress={() => void retryParked()}>
            Retry failed changes
          </Button>
        )}
        <Button size="lg" variant="glass" disabled={!canSync} onPress={syncNow}>
          Sync now
        </Button>
      </View>
    </SettingsSection>
  );
}
