import {
  profileLabel,
  removeVaultDescription,
  SessionContext,
  useEmailVerification,
  usePendingChangeCount,
  useRemoveFromDevice,
  useStore,
  useSyncClock,
  useSyncSummary,
} from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { StatusPill } from "@repo/ui/components/StatusPill";
import { useContext, useState } from "react";
import VerifyEmailDialog from "@/components/VerifyEmailDialog";
import { DemoVaultNotice } from "@/features/demo";
import ChangePasswordDialog from "./ChangePasswordDialog";
import CreateAccountDialog from "./CreateAccountDialog";
import DeleteAccountDialog from "./DeleteAccountDialog";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsActionRow, SettingsRow, useSettingsButtonSize } from "./SettingsRow";
import { SYNC_TONE, syncPillLabel } from "./sync-tone";
import TwoFactorSettings from "./TwoFactorSettings";

/** Web keys live in memory only: a reload drops every key and any decrypted state. */
const reload = () => window.location.reload();

function ProfileCard({ name }: { name: string }) {
  const { status, summary } = useSyncSummary();
  const now = useSyncClock(status.lastSyncedAt);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 max-sm:gap-3 max-sm:p-4">
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-semibold text-lg text-primary-foreground max-sm:size-11"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-base">{name}</span>
      <StatusPill tone={SYNC_TONE[summary.state]}>{syncPillLabel(summary, status, now)}</StatusPill>
    </div>
  );
}

/**
 * The vault on this device and its account (ADR 0001 D2): how it signs in
 * (password D10, two-factor; a local vault can become an online account, D9),
 * then removing it from this device or deleting the account (Sign out is with
 * Lock now, `SessionActions`).
 */
export default function AccountSettingsPage() {
  const { mode } = useContext(SessionContext);
  const { profile, active } = useStore();
  const { removeFromDevice, removing } = useRemoveFromDevice();
  const pendingChanges = usePendingChangeCount();
  const { required: verifyRequired } = useEmailVerification();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const buttonSize = useSettingsButtonSize();

  if (!mode || !profile) return null;
  const linked = profile.mode === "linked";
  const demo = active?.entry.demo === true;
  const name = active ? profileLabel(active.entry) : (profile.email ?? "Vault on this device");

  return (
    <SettingsPage
      title="Account"
      description={
        linked
          ? "How you sign in, and how to remove the vault from this device or delete the account."
          : "How this vault unlocks, and how to remove it from this device."
      }
    >
      {demo && <DemoVaultNotice />}
      <ProfileCard name={name} />

      {!demo && (
        <SettingsGroup label="Sign-in">
          {verifyRequired && (
            <SettingsRow
              label="Email"
              status={{ label: "Not verified", tone: "warning" }}
              hint="Nothing syncs until you enter the code we sent you."
              control={
                <Button size={buttonSize} onClick={() => setVerifyOpen(true)}>
                  Verify email
                </Button>
              }
            />
          )}
          {!linked && (
            <SettingsActionRow
              label="Online account"
              hint="Back this vault up and use it on other devices."
              dialog={(trigger) => <CreateAccountDialog>{trigger}</CreateAccountDialog>}
              buttonLabel="Create online account"
              phoneValue="Create"
              disabled={removing}
            />
          )}
          <SettingsActionRow
            label="Password"
            hint={
              linked
                ? "Changing it signs out your other devices. Your recovery key stays the same."
                : "Unlocks this vault on this device. Your recovery key stays the same."
            }
            phoneHint={linked ? "Signs out your other devices" : "Unlocks this vault"}
            dialog={(trigger) => (
              <ChangePasswordDialog linked={linked}>{trigger}</ChangePasswordDialog>
            )}
            buttonLabel="Change password"
            phoneValue="Change"
            disabled={removing}
          />
          <TwoFactorSettings />
        </SettingsGroup>
      )}

      <SettingsGroup label="Leave or delete" variant="danger">
        <SettingsActionRow
          label="Remove from this device"
          hint={
            linked
              ? "Deletes the local copy. Your account and synced items stay on the server."
              : "Deletes this vault. It has no account, so no copy of it is kept anywhere else."
          }
          phoneHint={
            linked ? "Your account and synced items stay" : "No copy is kept anywhere else"
          }
          dialog={(trigger) => (
            <RemoveDialog
              title="Remove vault from this device?"
              description={removeVaultDescription(linked, pendingChanges)}
              removeTitle="Remove vault"
              onRemove={() => void removeFromDevice().then(reload)}
            >
              {trigger}
            </RemoveDialog>
          )}
          buttonLabel="Remove"
          buttonVariant="destructive"
          disabled={removing}
        />
        {linked && (
          <SettingsActionRow
            label="Delete account"
            hint="Deletes your account and everything stored for it. This can't be undone."
            phoneHint="Deletes everything. Can't be undone."
            dialog={(trigger) => (
              <DeleteAccountDialog onDeleted={reload}>{trigger}</DeleteAccountDialog>
            )}
            buttonLabel="Delete account"
            buttonVariant="destructive"
            disabled={removing}
          />
        )}
      </SettingsGroup>
      {verifyRequired && <VerifyEmailDialog open={verifyOpen} onOpenChange={setVerifyOpen} />}
    </SettingsPage>
  );
}
