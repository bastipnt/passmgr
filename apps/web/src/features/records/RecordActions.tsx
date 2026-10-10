import {
  getRecordWebsites,
  RECORD_TYPE_LABELS,
  ShortcutLayer,
  useMoveRecord,
  useSortedRecords,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import Link from "@repo/ui/components/Link";
import { cn } from "@repo/ui/lib/utils";
import {
  EllipsisIcon,
  ExternalLinkIcon,
  LockIcon,
  PencilLineIcon,
  Timeline,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { VaultBadge, VaultTile } from "@/features/vaults";
import { RecordAvatar } from "./RecordAvatar";
import { displayHost } from "./record-utils";
import { useRecordVault } from "./use-record-vault";

type MoreDropdownProps = {
  record: DecryptedRecord;
  onDelete: () => void;
  variant?: "outline" | "floating";
};

export function MoreDropdown({ record, onDelete, variant = "outline" }: MoreDropdownProps) {
  const { recordId } = record;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { writable, moveTargets } = useRecordVault(record);
  const [, navigate] = useLocation();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { moveRecord, movePending } = useMoveRecord({
    // A move is a new record (new id) in the target vault.
    onSuccess: (movedId, targetVaultId) => {
      // The list showed the vault it left: show every vault, so it stays in view.
      if (vaultFilter !== "all") setVaultFilter("all");
      navigate(recordPaths.record(movedId), { replace: true });
      const target = moveTargets.find((vault) => vault.vaultId === targetVaultId);
      toast.success(target ? `Moved to ${target.name}` : "Moved");
    },
    onError: () => toast.error("The item couldn't be moved"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={variant}
              size={variant === "floating" ? "icon-xl" : "icon-lg"}
              aria-label="More actions"
            >
              <EllipsisIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={recordPaths.recordVersions(recordId)} />}>
            <Timeline /> Versions
          </DropdownMenuItem>

          {/* Inline rather than a submenu: one that opens sideways runs off a phone. */}
          {writable && moveTargets.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {moveTargets.map((target) => (
                  <DropdownMenuItem
                    key={target.vaultId}
                    disabled={movePending}
                    onClick={() => moveRecord(record, target.vaultId)}
                  >
                    <VaultTile vault={target} size="xs" />
                    {target.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {writable && (
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <TrashIcon /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ShortcutLayer active={deleteDialogOpen}>
        <RemoveDialog
          title="Delete item"
          description="Are you sure you want to delete this item? This action cannot be undone."
          removeTitle="Delete"
          onRemove={onDelete}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      </ShortcutLayer>
    </>
  );
}

type RecordActionsProps = {
  record: DecryptedRecord;
  onDelete: () => void;
  className?: string;
};

export function RecordActions({ record, onDelete, className }: RecordActionsProps) {
  const { recordId, title } = record;
  const primaryWebsite = getRecordWebsites(record)?.find((website) => website.value)?.value;
  const { vault, writable, showVault } = useRecordVault(record);

  return (
    <div className={cn("flex flex-row items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-row items-center gap-4">
        <RecordAvatar record={record} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-bold font-display text-3xl tracking-[-0.02em]">{title}</h1>
          {primaryWebsite ? (
            <a
              href={primaryWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
            >
              {displayHost(primaryWebsite)}
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          ) : (
            record.type !== "login" && (
              <span className="text-muted-foreground text-sm">
                {RECORD_TYPE_LABELS[record.type].type}
              </span>
            )
          )}
          {showVault && vault && <RecordVaultLine vault={vault} writable={writable} />}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {writable && (
          <Link
            variant="outline"
            size="lg"
            className="h-10 font-medium text-sm"
            aria-label="Edit"
            href={recordPaths.editRecord(recordId)}
          >
            <PencilLineIcon />
            Edit
          </Link>
        )}
        <MoreDropdown record={record} onDelete={onDelete} />
      </div>
    </div>
  );
}

/** Which vault the record is in, and that it's read-only there. */
export function RecordVaultLine({
  vault,
  writable,
}: {
  vault: Parameters<typeof VaultBadge>[0]["vault"];
  writable: boolean;
}) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground text-sm">
      <VaultBadge vault={vault} />
      {!writable && (
        <span className="inline-flex items-center gap-1">
          <LockIcon className="size-3.5" aria-hidden />
          Read only
        </span>
      )}
    </span>
  );
}
