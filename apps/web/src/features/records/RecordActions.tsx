import {
  recordErrorMessage,
  ShortcutLayer,
  useMoveRecord,
  useRecordVault,
  useSortedRecords,
  useToggleFavorite,
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
import { Kbd } from "@repo/ui/components/Kbd";
import Link from "@repo/ui/components/Link";
import { cn } from "@repo/ui/lib/utils";
import {
  CopyPlusIcon,
  EllipsisIcon,
  PencilLineIcon,
  StarIcon,
  Timeline,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { VaultTile } from "@/features/vaults";
import { shortcutHint } from "@/lib/formatShortcut";
import { duplicateSheetSearch } from "./CreateRecordSheet";
import { RecordAvatar } from "./RecordAvatar";
import { RecordSubtitle } from "./RecordSubtitle";
import { searchReturnState } from "./search-history";
import { RECORD_SHORTCUTS } from "./use-record-actions";

type MoreDropdownProps = {
  record: DecryptedRecord;
  onDelete: () => void;
  variant?: "outline" | "floating";
};

export function MoreDropdown({ record, onDelete, variant = "outline" }: MoreDropdownProps) {
  const { recordId } = record;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { writable, moveTargets, canDuplicate } = useRecordVault(record);
  const [, navigate] = useLocation();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { moveRecord, movePending } = useMoveRecord({
    // A move is a new record (new id) in the target vault.
    onSuccess: (movedId, targetVaultId) => {
      // The list showed the vault it left: show every vault, so it stays in view.
      if (vaultFilter !== "all") setVaultFilter("all");
      navigate(recordPaths.record(movedId), { replace: true, state: searchReturnState() });
      const target = moveTargets.find((vault) => vault.vaultId === targetVaultId);
      toast.success(target ? `Moved to ${target.name}` : "Moved");
    },
    onError: (error) => toast.error(recordErrorMessage(error, "The item couldn't be moved")),
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
          {canDuplicate && (
            <DropdownMenuItem render={<Link href={duplicateSheetSearch(recordId)} />}>
              <CopyPlusIcon /> Duplicate
            </DropdownMenuItem>
          )}

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

type FavoriteButtonProps = {
  record: DecryptedRecord;
  variant?: "outline" | "floating";
};

/**
 * Star / unstar the record. A `read` member can't write a version, so for them
 * a starred record shows a plain star and an unstarred one nothing.
 */
export function FavoriteButton({ record, variant = "outline" }: FavoriteButtonProps) {
  const { writable } = useRecordVault(record);
  const { toggleFavorite, togglePending } = useToggleFavorite({
    onError: () => toast.error("The item couldn't be saved"),
  });
  const favorite = Boolean(record.favorite);
  const star = <StarIcon aria-hidden className={cn(favorite && "fill-warning text-warning")} />;

  if (!writable) {
    return favorite ? (
      <span
        className={cn(
          "flex items-center justify-center [&_svg]:size-4",
          variant === "floating" ? "size-12" : "size-10",
        )}
      >
        {star}
        <span className="sr-only">Favorite</span>
      </span>
    ) : null;
  }

  return (
    <Button
      variant={variant}
      size={variant === "floating" ? "icon-xl" : "icon-lg"}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      disabled={togglePending}
      onClick={() => toggleFavorite(record)}
    >
      {star}
    </Button>
  );
}

type RecordActionsProps = {
  record: DecryptedRecord;
  onDelete: () => void;
  className?: string;
};

export function RecordActions({ record, onDelete, className }: RecordActionsProps) {
  const { writable } = useRecordVault(record);

  return (
    <div className={cn("flex items-start gap-4.5", className)}>
      <RecordAvatar record={record} size="xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
        <h1 className="truncate font-display font-extrabold text-[2.5rem] leading-none tracking-[-0.035em]">
          {record.title}
        </h1>
        <RecordSubtitle record={record} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <FavoriteButton record={record} />
        {writable && (
          <Link
            variant="outline"
            size="lg"
            className="h-10 gap-1.5 pr-2.5 pl-3.5 font-medium text-sm"
            aria-label="Edit"
            href={recordPaths.editRecord(record.recordId)}
          >
            <PencilLineIcon />
            Edit
            <Kbd aria-hidden className="ml-1 border border-foreground/10 bg-transparent">
              {shortcutHint(RECORD_SHORTCUTS.edit)}
            </Kbd>
          </Link>
        )}
        <MoreDropdown record={record} onDelete={onDelete} />
      </div>
    </div>
  );
}
