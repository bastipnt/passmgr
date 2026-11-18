import { useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import ActivitySettings from "./ActivitySettings";
import ChangePasswordDialog from "./ChangePasswordDialog";
import SessionsSettings from "./SessionsSettings";
import { SettingsPage } from "./SettingsPage";

/** Signed-in devices and the account's activity. */
export default function DevicesSettingsPage() {
  const linked = useStore().profile?.mode === "linked";

  return (
    <SettingsPage
      title="Devices & activity"
      description="Where you're signed in, and what changed on your account recently."
    >
      {linked ? (
        <>
          <SessionsSettings />
          <ActivitySettings />
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-field px-5 py-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-3 max-sm:p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium text-sm">Something you don't recognize?</span>
              <span className="text-[13px] text-muted-foreground leading-4.5">
                Change your password. That signs out every other device.
              </span>
            </div>
            <ChangePasswordDialog linked>
              <Button variant="outline">Change password</Button>
            </ChangePasswordDialog>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Signed-in devices and account activity come with an online account.
        </p>
      )}
    </SettingsPage>
  );
}
