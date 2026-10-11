import { SessionContext, sessionDetail, sessionLabel, useSessions, useStore } from "@repo/client";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Spinner } from "@repo/ui/components/Spinner";
import { LogOutIcon, MonitorSmartphoneIcon } from "lucide-react";
import { useContext } from "react";

/**
 * The account's signed-in devices (linked profiles, `online` only): end one,
 * or all but this one. A signed-out device locks (like Sign out); its local
 * vault and unsynced changes stay until someone signs in there again.
 */
export default function SessionsSettings() {
  const { mode } = useContext(SessionContext);
  const { profile } = useStore();
  const { sessions, isPending, error, revoke, revokeOthers, pending } = useSessions();
  if (profile?.mode !== "linked") return null;

  const others = sessions.filter((s) => !s.current);
  const failed = () => toast.error("Could not sign the device out. Try again.");

  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="gap-3">
        <div className="flex flex-col gap-1">
          <ItemTitle>
            <MonitorSmartphoneIcon className="size-4" aria-hidden />
            Signed-in devices
          </ItemTitle>
          <ItemDescription>
            {mode !== "online"
              ? "Connect to your account to see where you are signed in."
              : "A signed-out device locks and needs the master password again. Its unsynced changes stay on it."}
          </ItemDescription>
        </div>
        {isPending && <Spinner aria-label="Loading devices" />}
        {error && <p className="text-destructive text-sm">Could not load your devices.</p>}
        {sessions.length > 0 && (
          <ul className="flex flex-col divide-y" aria-label="Signed-in devices">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">
                    {sessionLabel(session)}
                    {session.current && " (this device)"}
                  </span>
                  <span className="text-muted-foreground text-xs">{sessionDetail(session)}</span>
                </div>
                {!session.current && (
                  <RemoveDialog
                    title="Sign this device out?"
                    description={`${sessionLabel(session)} locks and needs the master password to sign in again. Its unsynced changes stay on it.`}
                    removeTitle="Sign out"
                    onRemove={() => void revoke(session.id).catch(failed)}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Sign out ${sessionLabel(session)}`}
                    >
                      <LogOutIcon />
                      Sign out
                    </Button>
                  </RemoveDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </ItemContent>
      {others.length > 0 && (
        <ItemActions>
          <RemoveDialog
            title="Sign out all other devices?"
            description="Every other device locks and needs the master password to sign in again. This device stays signed in."
            removeTitle="Sign out others"
            onRemove={() => void revokeOthers().catch(failed)}
          >
            <Button variant="outline" disabled={pending}>
              <LogOutIcon />
              Sign out other devices
            </Button>
          </RemoveDialog>
        </ItemActions>
      )}
    </Item>
  );
}
