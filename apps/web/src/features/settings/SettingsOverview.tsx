import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import { cn } from "@repo/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { useRoute, Link as WouterLink } from "wouter";
import { settingsPaths } from "@/app/route-paths";

type SidebarItemParams = {
  path: string;
  title: string;
};

function SidebarItem({ path, title }: SidebarItemParams) {
  const [active] = useRoute(path);

  return (
    <Item variant={active ? "active" : "outline"} render={<WouterLink href={path} />}>
      <ItemContent className="gap-1">
        <ItemTitle>{title}</ItemTitle>
      </ItemContent>

      <ItemActions>
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  );
}

type SettingsOverviewProps = {
  className?: string;
};

export default function SettingsOverview({ className }: SettingsOverviewProps) {
  return (
    <section className={cn("scroll-py-4 overflow-y-auto p-4 sm:border-r", className)}>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <ItemGroup>
          <SidebarItem title="General Settings" path={settingsPaths.general} />
          <SidebarItem title="Password Generator" path={settingsPaths.generator} />
          <SidebarItem title="Security" path={settingsPaths.security} />
          <SidebarItem title="Duplicates" path={settingsPaths.duplicates} />
          <SidebarItem title="Weak Passwords" path={settingsPaths.weakPasswords} />
        </ItemGroup>
      </div>
    </section>
  );
}
