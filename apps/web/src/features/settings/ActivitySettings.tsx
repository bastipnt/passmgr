import {
  accountEventDetail,
  accountEventTitle,
  isNotableAccountEvent,
  SessionContext,
  useAccountActivity,
  useStore,
} from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { HistoryIcon, TriangleAlertIcon } from "lucide-react";
import { useContext } from "react";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";

/** The account's security activity (linked profiles, `online` only), newest first. */
export default function ActivitySettings() {
  const { mode } = useContext(SessionContext);
  const { profile } = useStore();
  const { events, isPending, error, hasMore, loadMore, loadingMore } = useAccountActivity();
  if (profile?.mode !== "linked") return null;

  if (mode !== "online" || events.length === 0)
    return (
      <SettingsGroup label="Account activity">
        <SettingsRow
          label={
            mode !== "online"
              ? "Not connected"
              : error
                ? "Could not load the activity"
                : isPending
                  ? "Loading activity…"
                  : "No activity yet"
          }
          hint={mode !== "online" ? "Connect to your account to see its activity." : undefined}
          control={
            mode === "online" && isPending ? <Spinner aria-label="Loading activity" /> : undefined
          }
        />
      </SettingsGroup>
    );

  return (
    <SettingsGroup
      label="Account activity"
      list
      footnote={
        (error || hasMore) && (
          <>
            {error && <span className="text-destructive">Could not load more activity. </span>}
            {hasMore && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : "Show older activity"}
              </Button>
            )}
          </>
        )
      }
    >
      {events.map((event) => {
        const notable = isNotableAccountEvent(event);
        return (
          <li key={event.id}>
            <SettingsRow
              icon={notable ? TriangleAlertIcon : HistoryIcon}
              iconTone={notable ? "warning" : "neutral"}
              label={accountEventTitle(event)}
              hint={
                <span title={new Date(event.createdAt).toLocaleString()}>
                  {accountEventDetail(event)}
                </span>
              }
            />
          </li>
        );
      })}
    </SettingsGroup>
  );
}
