import { usePassMonitorIssueCount } from "@repo/client";
import { SidebarItem } from "@repo/ui/components/SidebarItem";
import { CircleUserRoundIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { Link } from "wouter";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { SyncStatusCard } from "./SyncStatusMenu";

export function SidebarFooter() {
  const issues = usePassMonitorIssueCount();

  return (
    <div className="mt-auto flex flex-col gap-2 p-3 pt-0">
      <hr className="mx-2.5 border-foreground/10 dark:border-white/10" />
      <nav aria-label="App">
        <ul className="flex flex-col gap-0.5">
          <li>
            <SidebarItem
              icon={ShieldCheckIcon}
              label="Pass Monitor"
              count={issues || undefined}
              countTone="warning"
              render={<Link href={passMonitorPaths.index} />}
            />
          </li>
          <li>
            <SidebarItem
              icon={CircleUserRoundIcon}
              label="Account & sync"
              render={<Link href={settingsPaths.account} />}
            />
          </li>
          <li>
            <SidebarItem
              icon={SettingsIcon}
              label="Settings"
              render={<Link href={settingsPaths.index} />}
            />
          </li>
        </ul>
      </nav>
      <SyncStatusCard />
    </div>
  );
}
