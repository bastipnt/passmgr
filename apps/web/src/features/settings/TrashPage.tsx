import {
  formatTimeAgo,
  getRecordSubtitle,
  itemCount,
  type TrashedRecord,
  useSyncClock,
  useTrash,
  useVaults,
} from "@repo/client";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ArchiveRestoreIcon, EllipsisIcon, Trash2Icon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { RecordAvatar } from "@/features/records";
import { SettingsActionsSheet } from "./SettingsActionsSheet";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, useSettingsButtonSize } from "./SettingsRow";

/** What a confirmation is for: one record, or everything in the trash. */
type Purging = { kind: "one"; record: TrashedRecord } | { kind: "all"; count: number };

/**
 * Deleted items (newest first): put one back, or delete it for good with its
 * history, here and on every device. Read-only vaults show theirs without
 * actions. On a phone, delete for good is in a row's ⋯ sheet (no swipe actions
 * in the web app).
 */
export default function TrashPage() {
  const { records, ready, restore, purge, emptyTrash, pending } = useTrash();
  // Kept while the confirmation closes, so its text doesn't change mid-animation.
  const [purging, setPurging] = useState<Purging>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const purgeable = records.filter((record) => record.writable).length;
  const { getVault, hasSeveralVaults } = useVaults();
  const isMobile = useIsMobile();
  const buttonSize = useSettingsButtonSize();
  // Ticks so "deleted just now" moves on while the page stays open.
  const now = useSyncClock(records[0] ? Date.parse(records[0].deletedAt) : null);
  const [sheetRecord, setSheetRecord] = useState<TrashedRecord>();
  const [sheetOpen, setSheetOpen] = useState(false);

  async function onRestore(record: TrashedRecord) {
    try {
      await restore(record);
      toast.success(`${record.title} restored`);
    } catch {
      toast.error(`${record.title} couldn't be restored. Try again.`);
    }
  }

  async function onPurge(target: Purging) {
    try {
      if (target.kind === "one") await purge([target.record.recordId]);
      else await emptyTrash();
    } catch {
      toast.error("The trash couldn't be emptied. Try again.");
    }
  }

  function confirm(target: Purging) {
    setPurging(target);
    setConfirmOpen(true);
  }

  const emptyButton = (
    <Button
      variant="destructive"
      disabled={pending || purgeable === 0}
      onClick={() => confirm({ kind: "all", count: purgeable })}
      className={isMobile ? "w-full" : undefined}
    >
      Empty trash
    </Button>
  );
  const hint = (record: TrashedRecord) =>
    [
      hasSeveralVaults && getVault(record.vaultId)?.name,
      getRecordSubtitle(record),
      `deleted ${formatTimeAgo(Date.parse(record.deletedAt), now)}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <SettingsPage
      title="Trash"
      description="Deleted items stay here until you restore them or delete them for good."
      action={isMobile ? undefined : emptyButton}
    >
      {ready && records.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-5 py-8 text-center max-sm:gap-1.5 max-sm:px-4 max-sm:py-7">
          <span
            aria-hidden="true"
            className="mb-1 grid size-11 place-items-center rounded-xl bg-muted text-primary-text"
          >
            <Trash2Icon className="size-5" />
          </span>
          <p className="font-medium text-sm">Trash is empty</p>
          <p className="text-[13px] text-muted-foreground">Items you delete show up here first.</p>
        </div>
      )}
      {records.length > 0 && (
        <SettingsGroup label={itemCount(records.length)} list>
          {records.map((record) => (
            <li key={record.recordId}>
              <SettingsRow
                media={<RecordAvatar record={record} />}
                label={record.title}
                hint={hint(record)}
                control={
                  record.writable ? (
                    <>
                      <Button
                        variant="outline"
                        size={buttonSize}
                        disabled={pending}
                        aria-label={`Restore ${record.title}`}
                        onClick={() => void onRestore(record)}
                      >
                        Restore
                      </Button>
                      {isMobile ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={`More actions for ${record.title}`}
                          onClick={() => {
                            setSheetRecord(record);
                            setSheetOpen(true);
                          }}
                        >
                          <EllipsisIcon />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          disabled={pending}
                          aria-label={`Delete ${record.title} for good`}
                          title="Delete for good"
                          onClick={() => confirm({ kind: "one", record })}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              />
            </li>
          ))}
        </SettingsGroup>
      )}
      {isMobile && records.length > 0 && emptyButton}
      {sheetRecord && (
        <SettingsActionsSheet
          title={sheetRecord.title}
          summary={<span className="text-muted-foreground text-sm">{hint(sheetRecord)}</span>}
          actions={[
            {
              key: "restore",
              label: "Restore",
              icon: ArchiveRestoreIcon,
              run: () => void onRestore(sheetRecord),
            },
            {
              key: "purge",
              label: "Delete for good",
              icon: TrashIcon,
              destructive: true,
              run: () => confirm({ kind: "one", record: sheetRecord }),
            },
          ]}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}

      {purging && (
        <RemoveDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={
            purging.kind === "one"
              ? `Delete ${purging.record.title} for good?`
              : `Delete ${itemCount(purging.count)} for good?`
          }
          description={`${purging.kind === "one" ? "Its" : "Their"} history goes too, on every device. This can't be undone.`}
          removeTitle="Delete for good"
          onRemove={() => {
            setConfirmOpen(false);
            void onPurge(purging);
          }}
        />
      )}
    </SettingsPage>
  );
}
