import { usePassMonitorIssueCount, useSyncSummary } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { CountBadge } from "@repo/ui/components/CountBadge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@repo/ui/components/DropdownMenu";
import { CircleUserRoundIcon, LockIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { Link } from "wouter";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { useLockVault } from "./lock-vault";
import { SyncDot, SyncStatusPopup } from "./SyncStatusMenu";

/**
 * The phone bar's account button: Pass Monitor issues as an amber badge, the
 * sync state as a dot. Its menu has the sync details, then what the desktop
 * sidebar's foot links, and Lock.
 */
export function AccountMenu() {
  const issues = usePassMonitorIssueCount();
  const { summary } = useSyncSummary();
  const lockVault = useLockVault();
  const issueNoun = issues === 1 ? "issue" : "issues";
  const accountLabel = issues ? `Account, ${issues} Pass Monitor ${issueNoun}` : "Account";

  return (
    <SyncStatusPopup
      trigger={
        <Button
          variant="floating"
          size="icon-xl"
          aria-label={`${accountLabel}, sync status: ${summary.title}`}
          className="relative"
        >
          <CircleUserRoundIcon className="size-5" />
          {issues ? <CountBadge count={issues} className="-top-0.5 -right-0.5" /> : null}
          <SyncDot
            state={summary.state}
            className="absolute right-1 bottom-1 size-2.5 ring-2 ring-white dark:ring-[rgb(28_26_40)]"
          />
        </Button>
      }
    >
      <DropdownMenuItem render={<Link href={passMonitorPaths.index} />}>
        <ShieldCheckIcon />
        <span className="flex-1">Pass Monitor</span>
        {issues ? (
          <>
            <CountBadge count={issues} placement="inline" />
            <span className="sr-only">
              , {issues} {issueNoun}
            </span>
          </>
        ) : null}
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href={settingsPaths.index} />}>
        <SettingsIcon />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={lockVault}>
        <LockIcon />
        Lock vault
      </DropdownMenuItem>
    </SyncStatusPopup>
  );
}
