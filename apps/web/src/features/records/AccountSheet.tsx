import {
  profileHue,
  profileLabel,
  usePassMonitorIssueCount,
  useStore,
  useSyncSummary,
} from "@repo/client";
import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { CountBadge } from "@repo/ui/components/CountBadge";
import { ListRow, ListRowIcon } from "@repo/ui/components/ListRow";
import { ProfileAvatar } from "@repo/ui/components/ProfileAvatar";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRightIcon,
  CircleUserRoundIcon,
  LockIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { useLockVault } from "./lock-vault";
import { SyncDot, SyncStatusCard } from "./SyncStatusCard";

const TITLE = "Account";

const issueNoun = (issues: number) => (issues === 1 ? "issue" : "issues");

/**
 * The phone bar's account button: Pass Monitor issues as an amber badge, the
 * sync state as a dot. It opens `AccountSheet`.
 */
export function AccountButton() {
  const issues = usePassMonitorIssueCount();
  const { summary } = useSyncSummary();
  const [open, setOpen] = useState(false);
  const accountLabel = issues ? `Account, ${issues} Pass Monitor ${issueNoun(issues)}` : "Account";

  return (
    <>
      <Button
        variant="floating"
        size="icon-xl"
        aria-label={`${accountLabel}, sync status: ${summary.title}`}
        aria-haspopup="dialog"
        className="relative"
        onClick={() => setOpen(true)}
      >
        <CircleUserRoundIcon className="size-5" />
        {issues ? <CountBadge count={issues} className="-top-0.5 -right-0.5" /> : null}
        <SyncDot
          state={summary.state}
          className="absolute right-1 bottom-1 size-2.5 ring-2 ring-white dark:ring-card"
        />
      </Button>
      <AccountSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The desktop sidebar's foot as a phone sheet: who is signed in, its pages, sync, and Lock. */
function AccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useStore();
  const issues = usePassMonitorIssueCount();
  const lockVault = useLockVault();
  const isMobile = useIsMobile();
  const close = () => onOpenChange(false);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={TITLE}
      actions={isMobile && <SheetDrawerHeader title={TITLE} />}
    >
      <div className="flex flex-col gap-3">
        {active && (
          <div className="flex items-center gap-3 px-4 pb-1 sm:px-5">
            <ProfileAvatar email={active.entry.email ?? undefined} hue={profileHue(active.entry)} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-[0.95rem]">
                {profileLabel(active.entry)}
              </span>
              <span className="text-muted-foreground text-xs">
                {active.entry.mode === "linked" ? "Synced account" : "On this device only"}
              </span>
            </div>
          </div>
        )}

        <nav aria-label="Account pages">
          <PageRow
            icon={ShieldCheckIcon}
            title="Pass Monitor"
            href={passMonitorPaths.index}
            onNavigate={close}
            badge={
              issues ? (
                <>
                  <CountBadge count={issues} placement="inline" />
                  <span className="sr-only">
                    , {issues} {issueNoun(issues)}
                  </span>
                </>
              ) : null
            }
          />
          <PageRow
            icon={CircleUserRoundIcon}
            title="Account & sync"
            href={settingsPaths.account}
            onNavigate={close}
          />
          <PageRow
            icon={SettingsIcon}
            title="Settings"
            href={settingsPaths.index}
            onNavigate={close}
          />
        </nav>

        <div className="flex flex-col gap-3 px-4 sm:px-5">
          <SyncStatusCard />
          <Button variant="outline" size="lg" className="w-full rounded-full" onClick={lockVault}>
            <LockIcon />
            Lock vault
          </Button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function PageRow({
  icon: Icon,
  title,
  href,
  badge,
  onNavigate,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  badge?: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <ListRow
      render={<Link href={href} onClick={onNavigate} />}
      media={
        <ListRowIcon>
          <Icon />
        </ListRowIcon>
      }
      title={title}
      trailing={
        <>
          {badge}
          <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </>
      }
    />
  );
}
