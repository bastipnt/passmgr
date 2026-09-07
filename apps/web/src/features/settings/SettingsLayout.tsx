import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import Link from "@repo/ui/components/Link";
import { ArrowLeft, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRoute, Link as WouterLink } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";

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

      <ItemActions className="hidden sm:block">
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  );
}

type SettingsLayoutProps = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[auto_1fr] sm:grid-cols-[250px_1fr] md:grid-cols-[300px_1fr]">
      <header className="col-span-2 flex flex-row content-stretch gap-4 border-b p-4">
        <Link variant="outline" size="icon" href={recordPaths.index}>
          <ArrowLeft className="h-[1.2rem] w-[1.2rem]" />
        </Link>
      </header>
      <main className="col-span-2 grid items-stretch overflow-hidden sm:grid-cols-subgrid">
        <section className="scroll-py-4 overflow-y-scroll p-4 sm:border-r">
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <ItemGroup>
              <SidebarItem title="General Settings" path={settingsPaths.index} />
              <SidebarItem title="Password Generator" path={settingsPaths.generator} />
              <SidebarItem title="Security" path={settingsPaths.security} />
              <SidebarItem title="Duplicates" path={settingsPaths.duplicates} />
              <SidebarItem title="Weak Passwords" path={settingsPaths.weakPasswords} />
            </ItemGroup>
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
