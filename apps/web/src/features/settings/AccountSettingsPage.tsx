import { ItemGroup } from "@repo/ui/components/Item";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import AccountSettings from "./AccountSettings";

/**
 * The vault on this device and its account (ADR 0001 D2): create an online
 * account or sign out, password, removal.
 */
export default function AccountSettingsPage() {
  return (
    <>
      <PanelHeader>
        <PanelTitle>Account</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <AccountSettings />
        </ItemGroup>
      </div>
    </>
  );
}
