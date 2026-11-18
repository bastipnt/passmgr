import {
  removeVaultDescription,
  SessionContext,
  type SessionMode,
  useEmailVerification,
  usePendingChangeCount,
  useRemoveFromDevice,
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
import {
  CloudUploadIcon,
  KeyRoundIcon,
  MailCheckIcon,
  TrashIcon,
  UserRoundXIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import VerifyEmailDialog from "@/components/VerifyEmailDialog";
import { DemoVaultNotice } from "@/features/demo";
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
 * Account actions (ADR 0001 D2): removing the vault deletes the local copy
 * (Sign out is with Lock now, `SessionActions`). A
 * local vault can become an online account (D9). The master password changes
 * in both modes (D10). An online account can be deleted for good.
 */
export default function AccountSettings() {
  const { mode } = useContext(SessionContext);
  const { profile, active } = useStore();
  const { removeFromDevice, removing } = useRemoveFromDevice();
  const pendingChanges = usePendingChangeCount();
  const { required: verifyRequired } = useEmailVerification();
  const [verifyOpen, setVerifyOpen] = useState(false);

  if (!mode || !profile) return null;
  const linked = profile.mode === "linked";
  const demo = active?.entry.demo === true;

  return (
    <div className="flex flex-col gap-3">
      {demo && <DemoVaultNotice />}
      <Item variant="outline">
        <ItemContent className="gap-1">
          <ItemTitle>{linked ? profile.email : (active?.entry.name ?? "Local vault")}</ItemTitle>
          <ItemDescription>
            {verifyRequired
              ? "Your email isn't verified yet, so nothing syncs. Enter the code we sent you."
              : STATUS[mode]}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="flex-wrap">
          {verifyRequired && (
            <>
              <Button onClick={() => setVerifyOpen(true)}>
                <MailCheckIcon />
                Verify email
              </Button>
              <VerifyEmailDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
            </>
          )}
          {!linked && !demo && (
            <CreateAccountDialog>
              <Button variant="outline" disabled={removing}>
                <CloudUploadIcon />
                Create online account
              </Button>
            </CreateAccountDialog>
          )}
          {!demo && (
            <ChangePasswordDialog linked={linked}>
              <Button variant="outline" disabled={removing}>
                <KeyRoundIcon />
                Change password
              </Button>
            </ChangePasswordDialog>
          )}
          <RemoveDialog
            title="Remove vault from this device?"
            description={removeVaultDescription(linked, pendingChanges)}
            removeTitle="Remove vault"
            onRemove={() => void removeFromDevice().then(reload)}
          >
            <Button variant="destructive" disabled={removing}>
              <TrashIcon />
              Remove from device
            </Button>
          </RemoveDialog>
          {linked && (
            <DeleteAccountDialog onDeleted={reload}>
              <Button variant="destructive" disabled={removing}>
                <UserRoundXIcon />
                Delete account
              </Button>
            </DeleteAccountDialog>
          )}
        </ItemActions>
      </Item>
    </div>
  );
}
