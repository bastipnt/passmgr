import { useBreachCheck, usePassMonitor } from "@repo/client";
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
  off?: boolean;
};

function Category({ path, title, description, count, failed, off }: CategoryProps) {
  return (
    <Item variant="outline" render={<WouterLink href={path} />}>
      <ItemContent className="gap-1">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {off ? (
          <Badge variant="outline">Off</Badge>
        ) : failed ? (
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
  const { weak, weakFailed, reused, duplicates, old, insecure, missingTwoFactor, twoFactorFailed } =
    usePassMonitor();
  const breach = useBreachCheck();

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
          <Category
            title="Breached passwords"
            description={
              breach.enabled === false
                ? "Check against known data breaches"
                : "Found in known data breaches"
            }
            path={passMonitorPaths.breached}
            count={breach.breached?.length}
            failed={
              breach.breached === null && !breach.checking && (breach.failed || breach.offline)
            }
            off={breach.enabled === false}
          />
          <Category
            title="Insecure websites"
            description="Logins on plain HTTP"
            path={passMonitorPaths.insecure}
            count={insecure?.length}
          />
          <Category
            title="Missing 2FA"
            description="Sites that offer two-factor authentication"
            path={passMonitorPaths.twoFactor}
            count={missingTwoFactor?.length}
            failed={twoFactorFailed}
          />
        </ItemGroup>
      </div>
    </>
  );
}
