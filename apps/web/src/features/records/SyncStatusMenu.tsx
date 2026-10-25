import {
  type SyncState,
  syncCardLines,
  useLastSyncedLabel,
  useReconnect,
  useSyncClock,
  useSyncSummary,
} from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { cn } from "@repo/ui/lib/utils";
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUploadIcon,
  HardDriveIcon,
  LogInIcon,
  type LucideIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  UserRoundIcon,
} from "lucide-react";
import { type ComponentProps, type ReactElement, useState } from "react";
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

type SyncStatusPopupProps = {
  trigger: ReactElement;
} & Pick<ComponentProps<typeof DropdownMenuContent>, "align" | "side">;

/**
 * Where syncing stands (ADR 0001 D8) and what can be done about it: sync now,
 * retry parked changes, or (a vault without an account) the account settings
 * to create one. Offline is a state, not an error: writes keep working and
 * wait on the device.
 */
function SyncStatusPopup({ trigger, align = "end", side }: SyncStatusPopupProps) {
  const { status, summary, canSync, syncNow, retryParked } = useSyncSummary();
  const lastSynced = useLastSyncedLabel(status.lastSyncedAt);
  const { canReconnect, reconnect } = useReconnect();
  // Controlled, so opening re-renders and reads `canReconnect()` afresh.
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} side={side} className="w-72">
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
        {open && canReconnect() && (
          <DropdownMenuItem onClick={() => void reconnect()}>
            <LogInIcon />
            Connect now
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

/** The phone page bar's 48px button for `SyncStatusPopup`; desktop has the sidebar's `SyncStatusCard`. */
export function SyncStatusMenu() {
  const { summary } = useSyncSummary();
  const Icon = ICONS[summary.state];

  return (
    <SyncStatusPopup
      trigger={
        <Button
          variant="floating"
          size="icon-xl"
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
  );
}

const DOT_COLORS: Record<SyncState, string> = {
  local: "bg-muted-foreground/50",
  error: "bg-destructive",
  offline: "bg-destructive",
  syncing: "bg-success",
  pending: "bg-success",
  synced: "bg-success",
};

const CARD_TRIGGER_CLASS =
  "rounded-xl outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25";

/**
 * The desktop sidebar's sync card: a dot and two lines, opening `SyncStatusPopup`.
 * `collapsed` (the icon rail) keeps only the dot, the lines in its tooltip.
 */
export function SyncStatusCard({ collapsed = false }: { collapsed?: boolean }) {
  const { status, summary, canSync, syncNow } = useSyncSummary();
  const now = useSyncClock(status.lastSyncedAt);
  const { title, detail } = syncCardLines(summary, status, now);
  const syncing = summary.state === "syncing";
  const dot = (
    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT_COLORS[summary.state])} />
  );

  if (collapsed)
    return (
      <Tooltip>
        <SyncStatusPopup
          align="start"
          side="right"
          trigger={
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Sync status: ${summary.title}`}
                  className={cn(CARD_TRIGGER_CLASS, "grid size-10 place-items-center")}
                >
                  {dot}
                </button>
              }
            />
          }
        />
        <TooltipContent side="right" className="flex flex-col">
          <span className="font-semibold">{title}</span>
          <span className="opacity-80">{detail}</span>
        </TooltipContent>
      </Tooltip>
    );

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-foreground/10 bg-card/70 p-1 dark:border-white/10">
      <SyncStatusPopup
        align="start"
        side="top"
        trigger={
          <button
            type="button"
            aria-label={`Sync status: ${summary.title}`}
            className={cn(
              CARD_TRIGGER_CLASS,
              "flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left",
            )}
          >
            {dot}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-sm">{title}</span>
              <span className="truncate text-muted-foreground text-xs">{detail}</span>
            </span>
          </button>
        }
      />
      {(canSync || syncing) && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={syncNow}
          disabled={syncing}
          aria-label="Sync now"
          title="Sync now"
        >
          <RefreshCwIcon className={cn(syncing && "animate-spin motion-reduce:animate-none")} />
        </Button>
      )}
    </div>
  );
}
