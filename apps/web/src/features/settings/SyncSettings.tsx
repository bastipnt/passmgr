import { useLastSyncedLabel, useStore, useSyncSummary } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { HardDriveIcon, RefreshCwIcon } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow, useSettingsButtonSize } from "./SettingsRow";
import { SYNC_TONE } from "./sync-tone";

/**
 * Sync with the account (ADR 0001 D8): where it stands, when it last went
 * through, and the manual nudges (sync now, retry parked, drop the vaults the
 * server stopped listing). A vault without an account says why nothing syncs.
 */
export default function SyncSettings() {
  const { profile } = useStore();
  const { status, summary, canSync, syncNow, retryParked, confirmVaultLoss } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);
  const size = useSettingsButtonSize();
  const linked = profile?.mode === "linked";

  return (
    <SettingsGroup label="Sync">
      <SettingsRow
        icon={summary.state === "local" ? HardDriveIcon : RefreshCwIcon}
        iconTone={SYNC_TONE[summary.state]}
        label={summary.title}
        hint={
          <output>
            {summary.detail}
            {linked && lastSynced && ` ${lastSynced}.`}
          </output>
        }
        control={
          linked ? (
            <Button variant="outline" size={size} disabled={!canSync} onClick={syncNow}>
              Sync now
            </Button>
          ) : undefined
        }
      />
      {linked && status.vaultsMissing.length > 0 && (
        <SettingsRow
          label="Missing vaults"
          hint="Removes them from this device. The server no longer lists them."
          stackOnPhone
          control={
            <Button variant="destructive" onClick={() => void confirmVaultLoss()}>
              Remove missing vaults
            </Button>
          }
        />
      )}
      {linked && status.parked > 0 && (
        <SettingsRow
          label="Failed changes"
          hint="Tries to upload them again."
          stackOnPhone
          control={
            <Button variant="outline" onClick={() => void retryParked()}>
              Retry failed changes
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
}
