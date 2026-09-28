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
  const [active] = useRoute(`${path}/*?`);

  return (
    <Item
      variant={active ? "active" : "outline"}
      // Phones: a flat, full-bleed row list instead of stacked cards.
      className="max-sm:h-14 max-sm:rounded-none max-sm:border-0 max-sm:border-foreground/8 max-sm:border-b max-sm:bg-transparent max-sm:px-5 max-sm:text-base dark:max-sm:border-white/8 dark:max-sm:bg-transparent"
      render={<WouterLink href={path} />}
    >
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
    <section className={cn("scroll-py-4 p-4 max-sm:px-0 max-sm:pt-2", className)}>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <ItemGroup className="max-sm:gap-0">
          <SidebarItem title="General Settings" path={settingsPaths.general} />
          <SidebarItem title="Password Generator" path={settingsPaths.generator} />
          <SidebarItem title="Security" path={settingsPaths.security} />
          <SidebarItem title="Pass Monitor" path={settingsPaths.passMonitor} />
        </ItemGroup>
      </div>
    </section>
  );
}
