import { usePassMonitor } from "@repo/client";
import { Badge } from "@repo/ui/components/Badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Spinner } from "@repo/ui/components/Spinner";
import { ChevronRightIcon } from "lucide-react";
import { Link as WouterLink } from "wouter";
import { passMonitorPaths } from "@/app/route-paths";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

type CategoryProps = {
  path: string;
  title: string;
  description: string;
  count: number | undefined;
  failed?: boolean;
};

function Category({ path, title, description, count, failed }: CategoryProps) {
  return (
    <Item variant="outline" render={<WouterLink href={path} />}>
      <ItemContent className="gap-1">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {failed ? (
          <Badge variant="outline" aria-label={`${title} couldn't be checked`}>
            —
          </Badge>
        ) : count === undefined ? (
          <Spinner aria-label={`Checking ${title.toLowerCase()}`} />
        ) : (
          <Badge variant={count > 0 ? "warning" : "success"} aria-label={`${count} ${title}`}>
            {count}
          </Badge>
        )}
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  );
}

const groupedCount = (groups: { records: unknown[] }[] | null) =>
  groups?.reduce((sum, group) => sum + group.records.length, 0);

export default function PassMonitorPage() {
  const { weak, weakFailed, reused, duplicates, old } = usePassMonitor();

  return (
    <>
      <PanelHeader>
        <PanelTitle>Pass Monitor</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <Category
            title="Weak passwords"
            description="Easy to guess"
            path={passMonitorPaths.weak}
            count={weak?.length}
            failed={weakFailed}
          />
          <Category
            title="Reused passwords"
            description="The same password in more than one place"
            path={passMonitorPaths.reused}
            count={groupedCount(reused)}
          />
          <Category
            title="Duplicates"
            description="The same account saved more than once"
            path={passMonitorPaths.duplicates}
            count={groupedCount(duplicates)}
          />
          <Category
            title="Old passwords"
            description="Unchanged for a year or longer"
            path={passMonitorPaths.old}
            count={old?.length}
          />
        </ItemGroup>
      </div>
    </>
  );
}
