import { breachCountLabel, formatTimeAgo, useBreachCheck } from "@repo/client";
import { toast } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { ItemGroup } from "@repo/ui/components/Item";
import { Label } from "@repo/ui/components/Label";
import { Spinner } from "@repo/ui/components/Spinner";
import { Switch } from "@repo/ui/components/Switch";
import { MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

const HOW_IT_WORKS =
  "Checks your passwords against Have I Been Pwned. Only the first 5 characters of each " +
  "password's SHA-1 hash leave this device; the match happens here.";

function statusLine({
  checking,
  offline,
  lastCheckedAt,
}: {
  checking: boolean;
  offline: boolean;
  lastCheckedAt: string | null;
}) {
  if (checking) return "Checking…";
  if (!lastCheckedAt) return null;
  const last = `Last checked ${formatTimeAgo(Date.parse(lastCheckedAt))}`;
  return offline ? `Offline. ${last}.` : `${last}.`;
}

export default function BreachedPasswordsPage() {
  const { enabled, setEnabled, breached, checking, failed, offline, lastCheckedAt } =
    useBreachCheck();

  const toggle = (on: boolean) => {
    setEnabled(on).catch((error: unknown) => {
      console.error("Failed to change the breach check", error);
      toast.error("Couldn't change the breach check. Try again.");
    });
  };

  if (enabled === false) {
    return (
      <MonitorPage
        title="Breached passwords"
        description={HOW_IT_WORKS}
        count={0}
        empty="The breach check is off."
        status={
          <Button className="self-start" onClick={() => toggle(true)}>
            Turn on breach check
          </Button>
        }
      >
        {null}
      </MonitorPage>
    );
  }

  const status = enabled ? statusLine({ checking, offline, lastCheckedAt }) : null;
  const error =
    enabled && breached === null && !checking
      ? offline
        ? "You're offline. The breach check runs once you're back online."
        : failed
          ? "Couldn't reach Have I Been Pwned. Try again later."
          : undefined
      : undefined;

  return (
    <MonitorPage
      title="Breached passwords"
      description="These passwords appeared in data breaches. Change them wherever you use them."
      count={breached?.length}
      empty="No breached passwords."
      error={error}
      actions={
        enabled ? (
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="breach-check-switch" className="text-muted-foreground text-sm">
              Breach check
            </Label>
            <Switch id="breach-check-switch" checked onCheckedChange={() => toggle(false)} />
          </div>
        ) : undefined
      }
      status={
        status && (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            {checking && <Spinner className="size-3" aria-hidden />}
            {status}
            {failed && !checking && breached !== null && " Some passwords couldn't be checked."}
          </p>
        )
      }
    >
      <ItemGroup>
        {breached?.map(({ record, count }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            detail={breachCountLabel(count)}
          />
        ))}
      </ItemGroup>
    </MonitorPage>
  );
}
