import {
  SessionContext,
  type SessionMode,
  unsyncedChangesWarning,
  usePendingChangeCount,
  useRemoveFromDevice,
  useSignOut,
  useStore,
} from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/Item";
import { LogOutIcon, TrashIcon } from "lucide-react";
import { useContext } from "react";

const STATUS: Record<SessionMode, string> = {
  local: "This vault lives only on this device. It has no account and is not backed up.",
  online: "Signed in. Changes sync with your account.",
  offline:
    "Not connected to the server. Your vault stays usable; it syncs once you are back online.",
};

/** Web keys live in memory only: a reload drops every key and any decrypted state. */
const reload = () => window.location.reload();

/**
 * Account actions (ADR 0001 D2): sign out ends the server session and keeps
 * the vault on this device; removing the vault deletes the local copy.
 */
export default function AccountSettings() {
  const { mode } = useContext(SessionContext);
  const { profile, active } = useStore();
  const { signOut, signingOut } = useSignOut();
  const { removeFromDevice, removing } = useRemoveFromDevice();
  const pendingChanges = usePendingChangeCount();

  if (!mode || !profile) return null;
  const linked = profile.mode === "linked";

  return (
    <Item variant="outline">
      <ItemContent className="gap-1">
        <ItemTitle>{linked ? profile.email : (active?.entry.name ?? "Local vault")}</ItemTitle>
        <ItemDescription>{STATUS[mode]}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap">
        {linked && (
          <Button
            variant="outline"
            disabled={signingOut || removing}
            onClick={() => void signOut().then(reload)}
          >
            <LogOutIcon />
            Sign out
          </Button>
        )}
        <RemoveDialog
          title="Remove vault from this device?"
          description={
            linked
              ? `This deletes the vault from this device. Your account and the data on the server are not affected; sign in again to get it back.${unsyncedChangesWarning(pendingChanges)}`
              : "This deletes the only copy of your vault. Without an export, everything in it is lost for good."
          }
          removeTitle="Remove vault"
          onRemove={() => void removeFromDevice().then(reload)}
        >
          <Button variant="destructive" disabled={signingOut || removing}>
            <TrashIcon />
            Remove from device
          </Button>
        </RemoveDialog>
      </ItemActions>
    </Item>
  );
}
