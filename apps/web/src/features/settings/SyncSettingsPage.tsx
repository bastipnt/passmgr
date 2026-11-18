import { ItemGroup } from "@repo/ui/components/Item";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import StorageSettings from "./StorageSettings";
import SyncSettings from "./SyncSettings";

/** How the vault syncs, and how safely this device keeps it. */
export default function SyncSettingsPage() {
  return (
    <>
      <PanelHeader>
        <PanelTitle>Sync &amp; storage</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <SyncSettings />
          <StorageSettings />
        </ItemGroup>
      </div>
    </>
  );
}
