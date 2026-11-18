import { useStore, useTwoFactor } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/Dialog";
import { RefreshCwIcon, ShieldOffIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import BackupCodes from "./BackupCodes";
import EnableTwoFactorDialog from "./EnableTwoFactorDialog";
import { SettingsRow, useSettingsButtonSize } from "./SettingsRow";
import TwoFactorPasswordForm from "./TwoFactorPasswordForm";

/** Turn two-factor off again: the master password, and the code (asked by the fresh login). */
function DisableTwoFactorDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const { disable, error, clearError, pending } = useTwoFactor();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) clearError();
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn off two-factor?</DialogTitle>
          <DialogDescription>
            Signing in to your account will need only your password again. Your backup codes stop
            working.
          </DialogDescription>
        </DialogHeader>
        <TwoFactorPasswordForm
          onSubmit={async (password) => {
            if (await disable(password)) setOpen(false);
          }}
          error={error}
          pending={pending}
          submitLabel="Turn off"
          destructive
          icon={<ShieldOffIcon />}
        />
      </DialogContent>
    </Dialog>
  );
}

/** New backup codes in place of the old ones, shown once. */
function RegenerateBackupCodesDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[]>();
  const [saved, setSaved] = useState(false);
  const { regenerateBackupCodes, error, clearError, pending } = useTwoFactor();
  const closable = !codes || saved;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending || (!next && !closable)) return;
        if (next) {
          clearError();
          setCodes(undefined);
          setSaved(false);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md" showCloseButton={closable}>
        <DialogHeader>
          <DialogTitle>{codes ? "Save your backup codes" : "New backup codes?"}</DialogTitle>
          <DialogDescription>
            {codes
              ? "Each code signs you in once if you lose your authenticator. They're shown only now: save them somewhere safe, outside this vault."
              : "Your current backup codes stop working and you get ten new ones."}
          </DialogDescription>
        </DialogHeader>
        {codes ? (
          <>
            <BackupCodes codes={codes} onSaved={() => setSaved(true)} />
            <DialogFooter>
              <Button disabled={!saved} onClick={() => setOpen(false)}>
                I saved them
              </Button>
            </DialogFooter>
          </>
        ) : (
          <TwoFactorPasswordForm
            onSubmit={async (password) => setCodes(await regenerateBackupCodes(password))}
            error={error}
            pending={pending}
            submitLabel="Get new codes"
            icon={<RefreshCwIcon />}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Two-factor for the account's server login (TOTP + backup codes), opt-in: a
 * row of the account's sign-in group. Online accounts only; it guards the
 * server, not this device's unlock.
 */
export default function TwoFactorSettings() {
  const { profile } = useStore();
  const { status, blocked } = useTwoFactor();
  const [enabling, setEnabling] = useState(false);
  const size = useSettingsButtonSize();
  if (profile?.mode !== "linked") return null;

  const enabled = status?.enabled === true;
  const left = status?.backupCodesLeft ?? 0;

  return (
    <>
      <SettingsRow
        label="Two-factor authentication"
        // Unknown while loading or offline: never claim "off" for an account that has it on.
        status={
          status &&
          (enabled ? { label: "On", tone: "success" } : { label: "Off", tone: "destructive" })
        }
        hint={
          blocked
            ? "Two-factor settings need a connection to the server."
            : !status
              ? "Checking your account…"
              : enabled
                ? `Signing in asks for a code from your authenticator app. ${left === 1 ? "1 backup code" : `${left} backup codes`} left.`
                : "Ask for a code from an authenticator app when you sign in. Unlocking this device stays password-only."
        }
        stackOnPhone={enabled}
        control={
          enabled ? (
            <>
              <RegenerateBackupCodesDialog>
                <Button variant="outline" size={size} disabled={blocked}>
                  New backup codes
                </Button>
              </RegenerateBackupCodesDialog>
              <DisableTwoFactorDialog>
                <Button variant="outline" size={size} disabled={blocked}>
                  Turn off
                </Button>
              </DisableTwoFactorDialog>
            </>
          ) : (
            <Button
              size={size}
              disabled={blocked || status === undefined}
              onClick={() => setEnabling(true)}
            >
              Turn on
            </Button>
          )
        }
      />
      <EnableTwoFactorDialog open={enabling} onOpenChange={setEnabling} />
    </>
  );
}
