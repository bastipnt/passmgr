import {
  removeVaultDescription,
  SessionContext,
  type SessionMode,
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
import { CloudUploadIcon, KeyRoundIcon, LogOutIcon, TrashIcon, UserRoundXIcon } from "lucide-react";
import { useContext } from "react";
import ChangePasswordDialog from "./ChangePasswordDialog";
import CreateAccountDialog from "./CreateAccountDialog";
import DeleteAccountDialog from "./DeleteAccountDialog";

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
 * the vault on this device; removing the vault deletes the local copy. A
 * local vault can become an online account (D9). The master password changes
 * in both modes (D10). An online account can be deleted for good.
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
        {!linked && (
          <CreateAccountDialog>
            <Button variant="outline" disabled={removing}>
              <CloudUploadIcon />
              Create online account
            </Button>
          </CreateAccountDialog>
        )}
        <ChangePasswordDialog linked={linked}>
          <Button variant="outline" disabled={signingOut || removing}>
            <KeyRoundIcon />
            Change password
          </Button>
        </ChangePasswordDialog>
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
          description={removeVaultDescription(linked, pendingChanges)}
          removeTitle="Remove vault"
          onRemove={() => void removeFromDevice().then(reload)}
        >
          <Button variant="destructive" disabled={signingOut || removing}>
            <TrashIcon />
            Remove from device
          </Button>
        </RemoveDialog>
        {linked && (
          <DeleteAccountDialog onDeleted={reload}>
            <Button variant="destructive" disabled={signingOut || removing}>
              <UserRoundXIcon />
              Delete account
            </Button>
          </DeleteAccountDialog>
        )}
      </ItemActions>
    </Item>
  );
}
