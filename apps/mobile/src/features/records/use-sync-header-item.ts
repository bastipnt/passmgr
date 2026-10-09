import { type SyncState, useLastSyncedLabel, useSyncSummary } from "@repo/client";
import { type NativeStackHeaderItemMenu, useRouter } from "expo-router";
import { useCSSVariable } from "uniwind";
import { settingsPaths } from "@/route-paths";

const SYMBOLS = {
  local: "internaldrive",
  error: "exclamationmark.icloud",
  syncing: "arrow.triangle.2.circlepath.icloud",
  offline: "icloud.slash",
  pending: "icloud.and.arrow.up",
  synced: "checkmark.icloud",
} as const satisfies Record<SyncState, string>;

/**
 * The records bar's sync indicator (ADR 0001 D8): a native menu whose symbol
 * says where syncing stands, with the details and what can be done about it.
 * Offline is a state, not an error: writes keep working and wait on the device.
 */
export function useSyncHeaderItem(): NativeStackHeaderItemMenu {
  const router = useRouter();
  const { status, summary, canSync, syncNow, retryParked } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const destructiveColor = useCSSVariable("--color-destructive") as string;
  const local = summary.state === "local";

  return {
    type: "menu",
    label: "Sync",
    accessibilityLabel: `Sync status: ${summary.title}`,
    icon: { type: "sfSymbol", name: SYMBOLS[summary.state] },
    tintColor: summary.state === "error" ? destructiveColor : foregroundColor,
    menu: {
      // The menu's header: where syncing stands, then its details.
      title: [summary.title, summary.detail, !local && lastSynced].filter(Boolean).join("\n"),
      items: [
        {
          type: "action",
          label: "Retry failed changes",
          icon: { type: "sfSymbol", name: "arrow.counterclockwise" },
          hidden: local || status.parked === 0,
          onPress: () => void retryParked(),
        },
        {
          type: "action",
          label: "Sync now",
          icon: { type: "sfSymbol", name: "arrow.triangle.2.circlepath" },
          hidden: !canSync,
          onPress: syncNow,
        },
        {
          type: "action",
          label: local ? "Create online account" : "Account & sync",
          icon: { type: "sfSymbol", name: "person.crop.circle" },
          onPress: () => router.navigate(settingsPaths.index),
        },
      ],
    },
  };
}
