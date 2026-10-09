import { type SyncState, useLastSyncedLabel, useSyncSummary } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { cn } from "@repo/ui/lib/utils";
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUploadIcon,
  HardDriveIcon,
  type LucideIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  UserRoundIcon,
} from "lucide-react";
import { Link } from "wouter";
import { settingsPaths } from "@/app/route-paths";

const ICONS: Record<SyncState, LucideIcon> = {
  local: HardDriveIcon,
  error: CloudAlertIcon,
  syncing: RefreshCwIcon,
  offline: CloudOffIcon,
  pending: CloudUploadIcon,
  synced: CloudCheckIcon,
};

type SyncStatusMenuProps = {
  /** `floating`: the phone's 48px page-bar button. */
  variant?: "outline" | "floating";
};

/**
 * Header indicator of where syncing stands (ADR 0001 D8), opening the details
 * and what can be done about it: sync now, retry parked changes, or (a vault
 * without an account) the account settings to create one. Offline is a state,
 * not an error: writes keep working and wait on the device.
 */
export function SyncStatusMenu({ variant = "outline" }: SyncStatusMenuProps) {
  const { status, summary, canSync, syncNow, retryParked } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);
  const Icon = ICONS[summary.state];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={variant === "floating" ? "icon-xl" : "icon"}
            aria-label={`Sync status: ${summary.title}`}
            title={summary.title}
            className="relative"
          >
            <Icon
              className={cn(
                summary.state === "syncing" && "animate-spin motion-reduce:animate-none",
                summary.state === "error" && "text-destructive",
              )}
            />
            {summary.state === "pending" && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background"
              />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        <output className="flex flex-col gap-1 px-2 py-1.5">
          <span className="font-semibold text-sm">{summary.title}</span>
          <span className="text-muted-foreground text-xs">{summary.detail}</span>
          {summary.state !== "local" && lastSynced && (
            <span className="text-muted-foreground text-xs">{lastSynced}</span>
          )}
        </output>
        <DropdownMenuSeparator />
        {status.parked > 0 && summary.state !== "local" && (
          <DropdownMenuItem onClick={() => void retryParked()}>
            <RotateCcwIcon />
            Retry failed changes
          </DropdownMenuItem>
        )}
        {canSync && (
          <DropdownMenuItem onClick={syncNow}>
            <RefreshCwIcon />
            Sync now
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link href={settingsPaths.account} />}>
          <UserRoundIcon />
          {summary.state === "local" ? "Create online account" : "Account & sync"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
