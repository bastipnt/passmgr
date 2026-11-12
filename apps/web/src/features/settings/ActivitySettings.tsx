import {
  accountEventDetail,
  accountEventTitle,
  isNotableAccountEvent,
  SessionContext,
  useAccountActivity,
  useStore,
} from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@repo/ui/components/Item";
import { Spinner } from "@repo/ui/components/Spinner";
import { HistoryIcon, TriangleAlertIcon } from "lucide-react";
import { useContext } from "react";

/** The account's security activity (linked profiles, `online` only), newest first. */
export default function ActivitySettings() {
  const { mode } = useContext(SessionContext);
  const { profile } = useStore();
  const { events, isPending, error, hasMore, loadMore, loadingMore } = useAccountActivity();
  if (profile?.mode !== "linked") return null;

  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="gap-3">
        <div className="flex flex-col gap-1">
          <ItemTitle>
            <HistoryIcon className="size-4" aria-hidden />
            Account activity
          </ItemTitle>
          <ItemDescription>
            {mode !== "online"
              ? "Connect to your account to see its activity."
              : "Sign-ins and security changes. Something you don't recognize? Change your password and sign out the other devices."}
          </ItemDescription>
        </div>
        {isPending && <Spinner aria-label="Loading activity" />}
        {error && <p className="text-destructive text-sm">Could not load the activity.</p>}
        {events.length > 0 && (
          <ul className="flex flex-col divide-y" aria-label="Account activity">
            {events.map((event) => {
              const notable = isNotableAccountEvent(event);
              return (
                <li key={event.id} className="flex items-center gap-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 font-medium text-sm">
                      {notable && (
                        <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden />
                      )}
                      {accountEventTitle(event)}
                    </span>
                    <span
                      className="truncate text-muted-foreground text-xs"
                      title={new Date(event.createdAt).toLocaleString()}
                    >
                      {accountEventDetail(event)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "Loading…" : "Show older activity"}
          </Button>
        )}
      </ItemContent>
    </Item>
  );
}
