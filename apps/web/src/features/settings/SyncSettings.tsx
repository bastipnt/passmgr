import { useLastSyncedLabel, useStore, useSyncSummary } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/Item";
import { RefreshCwIcon, RotateCcwIcon } from "lucide-react";

/**
 * Sync with the account (ADR 0001 D8), linked profiles only: where it stands,
 * when it last went through, and the manual nudges (sync now, retry parked).
 */
export default function SyncSettings() {
  const { profile } = useStore();
  const { status, summary, canSync, syncNow, retryParked } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);
  if (profile?.mode !== "linked") return null;

  return (
    <Item variant="outline">
      <ItemContent className="gap-1">
        <ItemTitle>Sync · {summary.title}</ItemTitle>
        <ItemDescription>
          <output>
            {summary.detail}
            {lastSynced && ` ${lastSynced}.`}
          </output>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap">
        {status.parked > 0 && (
          <Button variant="outline" onClick={() => void retryParked()}>
            <RotateCcwIcon />
            Retry failed changes
          </Button>
        )}
        <Button variant="outline" disabled={!canSync} onClick={syncNow}>
          <RefreshCwIcon />
          Sync now
        </Button>
      </ItemActions>
    </Item>
  );
}
