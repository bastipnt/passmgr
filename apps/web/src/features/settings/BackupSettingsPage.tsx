import { formatTimeAgo, useBackupReminder, useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { StatusPill } from "@repo/ui/components/StatusPill";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { type StatusTone, toneTextClassName } from "@repo/ui/lib/tone";
import { FileLockIcon, FileTextIcon } from "lucide-react";
import { useDemoMode } from "@/features/demo";
import { ImportDropZone } from "@/features/import";
import ExportDialog from "./ExportDialog";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsRowButton } from "./SettingsRow";

const BACKUP_HINT = "Every item in one .json file, locked with a backup password you choose.";
const PLAIN_HINT = "JSON or CSV, unencrypted. Anyone with the file can read your passwords.";

/**
 * "Never backed up" / "Backed up 3 days ago", amber while a local-only vault
 * has none or is due one (an account has the server's copy).
 */
function useBackupStatus(): { label: string; tone: StatusTone } {
  const { due, lastExportAt } = useBackupReminder();
  const local = useStore().active?.entry.mode === "local";
  if (!lastExportAt) return { label: "Never backed up", tone: local ? "warning" : "neutral" };
  return {
    label: `Backed up ${formatTimeAgo(Date.parse(lastExportAt))}`,
    tone: due ? "warning" : "neutral",
  };
}

function ExportRows() {
  const isMobile = useIsMobile();
  const status = useBackupStatus();

  if (isMobile)
    return (
      <>
        <ExportDialog kind="backup">
          <SettingsRowButton
            label="Encrypted backup"
            hint={<span className={toneTextClassName[status.tone]}>{status.label}</span>}
            value="Export"
            chevron
          />
        </ExportDialog>
        <ExportDialog kind="plain">
          <SettingsRowButton
            label="Plain file for another app"
            hint="JSON or CSV, unencrypted"
            chevron
          />
        </ExportDialog>
      </>
    );

  return (
    <>
      <SettingsRow
        icon={FileLockIcon}
        label="Encrypted backup"
        hint={BACKUP_HINT}
        control={
          <>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <ExportDialog kind="backup">
              <Button>Export backup</Button>
            </ExportDialog>
          </>
        }
      />
      <SettingsRow
        icon={FileTextIcon}
        label="Plain file for another app"
        hint={PLAIN_HINT}
        control={
          <ExportDialog kind="plain">
            <Button variant="outline">Export file</Button>
          </ExportDialog>
        }
      />
    </>
  );
}

/** Encrypted backups and plain files out, this app's and other managers' exports in (ADR 0001 D12). */
export default function BackupSettingsPage() {
  const local = useStore().active?.entry.mode === "local";
  const demoMode = useDemoMode();

  return (
    <SettingsPage
      title="Import & export"
      description="Back up your vault, move to another app, or bring items in from one."
    >
      <SettingsGroup
        label="Export"
        footnote={
          local
            ? "An encrypted backup is the only copy of this vault outside this browser."
            : undefined
        }
      >
        <ExportRows />
      </SettingsGroup>
      {!demoMode && (
        <SettingsGroup label="Import" cardless>
          <ImportDropZone />
        </SettingsGroup>
      )}
    </SettingsPage>
  );
}
