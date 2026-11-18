import { useStore } from "@repo/client";
import { ItemGroup } from "@repo/ui/components/Item";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import ActivitySettings from "./ActivitySettings";
import SessionsSettings from "./SessionsSettings";

/** Signed-in devices and the account's activity. */
export default function DevicesSettingsPage() {
  const linked = useStore().profile?.mode === "linked";

  return (
    <>
      <PanelHeader>
        <PanelTitle>Devices &amp; activity</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        {linked ? (
          <ItemGroup>
            <SessionsSettings />
            <ActivitySettings />
          </ItemGroup>
        ) : (
          <p className="text-muted-foreground text-sm">
            Signed-in devices and account activity come with an online account.
          </p>
        )}
      </div>
    </>
  );
}
