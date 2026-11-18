import { SessionContext, sessionDetail, sessionLabel, useSessions, useStore } from "@repo/client";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { StatusPill } from "@repo/ui/components/StatusPill";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useContext } from "react";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";

const FOOTNOTE =
  "Signing out a device locks it and asks for the password again. Its unsynced changes stay on it.";

const deviceIcon = (label: string) =>
  /\b(iOS|iPadOS|Android)\b/.test(label) ? SmartphoneIcon : MonitorIcon;

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

  if (mode !== "online" || sessions.length === 0)
    return (
      <SettingsGroup label="Signed-in devices" footnote={FOOTNOTE}>
        <SettingsRow
          label={
            mode !== "online"
              ? "Not connected"
              : isPending
                ? "Loading devices…"
                : error
                  ? "Could not load your devices"
                  : "No signed-in devices"
          }
          hint={
            mode !== "online"
              ? "Connect to your account to see where you are signed in."
              : undefined
          }
          control={
            mode === "online" && isPending ? <Spinner aria-label="Loading devices" /> : undefined
          }
        />
      </SettingsGroup>
    );

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup
        label="Signed-in devices"
        footnote={
          <>
            {error && <span className="text-destructive">Could not refresh your devices. </span>}
            {FOOTNOTE}
          </>
        }
        list
      >
        {sessions.map((session) => {
          const label = sessionLabel(session);
          return (
            <li key={session.id}>
              <SettingsRow
                icon={deviceIcon(label)}
                label={label}
                hint={sessionDetail(session)}
                control={
                  session.current ? (
                    <StatusPill tone="success">This device</StatusPill>
                  ) : (
                    <RemoveDialog
                      title="Sign this device out?"
                      description={`${label} locks and needs the password to sign in again. Its unsynced changes stay on it.`}
                      removeTitle="Sign out"
                      onRemove={() => void revoke(session.id).catch(failed)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        aria-label={`Sign out ${label}`}
                      >
                        Sign out
                      </Button>
                    </RemoveDialog>
                  )
                }
              />
            </li>
          );
        })}
      </SettingsGroup>
      {others.length > 0 && (
        <RemoveDialog
          title="Sign out all other devices?"
          description="Every other device locks and needs the password to sign in again. This device stays signed in."
          removeTitle="Sign out others"
          onRemove={() => void revokeOthers().catch(failed)}
        >
          <Button variant="outline" disabled={pending} className="self-start max-sm:self-stretch">
            Sign out other devices
          </Button>
        </RemoveDialog>
      )}
    </div>
  );
}
