import { usePassMonitor } from "@repo/client";
import { ExternalLink } from "@repo/ui/components/ExternalLink";
import { ItemGroup } from "@repo/ui/components/Item";
import { MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

export default function MissingTwoFactorPage() {
  const { missingTwoFactor, twoFactorFailed } = usePassMonitor();

  return (
    <MonitorPage
      title="Missing 2FA"
      description="These websites offer two-factor authentication with a one-time code. Turn it on there and save the setup key in the login."
      count={missingTwoFactor?.length}
      empty="Every login that could use 2FA has it."
      error={
        twoFactorFailed
          ? "The 2FA directory couldn't load. Reload the page to try again."
          : undefined
      }
      status={
        <p className="text-muted-foreground text-xs">
          Site list from <ExternalLink href="https://2fa.directory">2fa.directory</ExternalLink>,
          bundled with the app.
        </p>
      }
    >
      <ItemGroup>
        {missingTwoFactor?.map(({ record, site }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            detail={`${site.domain} supports 2FA`}
          />
        ))}
      </ItemGroup>
    </MonitorPage>
  );
}
