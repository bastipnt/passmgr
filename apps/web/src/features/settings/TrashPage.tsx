import { getRecordSubtitle, itemCount, type TrashedRecord, useTrash } from "@repo/client";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { Item, ItemActions, ItemGroup } from "@repo/ui/components/Item";
import { toLocalDateStr } from "@repo/util";
import { ArchiveRestoreIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import { RecordItemSummary } from "@/features/records";

/** What a confirmation is for: one record, or everything in the trash. */
type Purging = { kind: "one"; record: TrashedRecord } | { kind: "all"; count: number };

/**
 * Deleted items (newest first): put one back, or delete it for good with its
 * history, here and on every device. Read-only vaults show theirs without
 * actions.
 */
export default function TrashPage() {
  const { records, ready, restore, purge, emptyTrash, pending } = useTrash();
  // Kept while the confirmation closes, so its text doesn't change mid-animation.
  const [purging, setPurging] = useState<Purging>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const purgeable = records.filter((record) => record.writable).length;

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

  return (
    <>
      <PanelHeader className="flex-row items-center justify-between">
        <PanelTitle>Trash</PanelTitle>
        <Button
          variant="ghost-destructive"
          disabled={pending || purgeable === 0}
          onClick={() => confirm({ kind: "all", count: purgeable })}
        >
          Empty trash
        </Button>
      </PanelHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {ready && records.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nothing here. Items you delete stay in the trash until you delete them for good.
          </p>
        )}
        <ItemGroup>
          {records.map((record) => (
            <Item key={record.recordId} variant="outline">
              <RecordItemSummary
                record={record}
                detail={`${getRecordSubtitle(record) || "—"} · deleted ${toLocalDateStr(record.deletedAt)}`}
              />
              {record.writable && (
                <ItemActions>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={pending}
                    aria-label={`Restore ${record.title}`}
                    title="Restore"
                    onClick={() => void onRestore(record)}
                  >
                    <ArchiveRestoreIcon />
                  </Button>
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
                </ItemActions>
              )}
            </Item>
          ))}
        </ItemGroup>
      </div>

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
    </>
  );
}
