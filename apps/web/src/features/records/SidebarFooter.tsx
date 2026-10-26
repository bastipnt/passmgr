import { usePassMonitorIssueCount } from "@repo/client";
import { SidebarDivider, SidebarItem } from "@repo/ui/components/SidebarItem";
import { cn } from "@repo/ui/lib/utils";
import { CircleUserRoundIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { Link } from "wouter";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { SyncStatusCard } from "./SyncStatusCard";

export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const issues = usePassMonitorIssueCount();

  return (
    <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
      <nav aria-label="App">
        <ul className="flex flex-col gap-0.5">
          <li>
            <SidebarItem
              icon={ShieldCheckIcon}
              label="Pass Monitor"
              count={issues || undefined}
              countTone="warning"
              collapsed={collapsed}
              render={<Link href={passMonitorPaths.index} />}
            />
          </li>
          <li>
            <SidebarItem
              icon={CircleUserRoundIcon}
              label="Account & sync"
              collapsed={collapsed}
              render={<Link href={settingsPaths.account} />}
            />
          </li>
          <li>
            <SidebarItem
              icon={SettingsIcon}
              label="Settings"
              collapsed={collapsed}
              render={<Link href={settingsPaths.index} />}
            />
          </li>
        </ul>
      </nav>
      <SidebarDivider collapsed={collapsed} />
      <SyncStatusCard collapsed={collapsed} />
    </div>
  );
}
