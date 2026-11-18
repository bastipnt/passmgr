import { ItemGroup } from "@repo/ui/components/Item";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import ExportSettings from "./ExportSettings";

/** Encrypted backups out, other managers' exports in (ADR 0001 D12). */
export default function BackupSettingsPage() {
  return (
    <>
      <PanelHeader>
        <PanelTitle>Import &amp; export</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <ExportSettings />
        </ItemGroup>
      </div>
    </>
  );
}
