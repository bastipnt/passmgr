import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import { ChevronRightIcon } from "lucide-react";
import { Link as WouterLink } from "wouter";
import { settingsPaths } from "@/app/route-paths";

type PassMonitorItemParams = {
  path: string;
  title: string;
};

function PassMonitorItem({ path, title }: PassMonitorItemParams) {
  return (
    <Item variant="outline" render={<WouterLink href={path} />}>
      <ItemContent className="gap-1">
        <ItemTitle>{title}</ItemTitle>
      </ItemContent>

      <ItemActions>
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  );
}

export default function PassMonitorPage() {
  return (
    <div className="p-4">
      <ItemGroup>
        <PassMonitorItem title="Duplicates" path={settingsPaths.duplicates} />
        <PassMonitorItem title="Weak Passwords" path={settingsPaths.weakPasswords} />
        <PassMonitorItem title="Old Passwords" path={settingsPaths.weakPasswords} />
        <PassMonitorItem title="Reused Passwords" path={settingsPaths.reusedPasswords} />
      </ItemGroup>
    </div>
  );
}
