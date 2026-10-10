import {
  useGetRecords,
  useVaultActions,
  useVaults,
  type VaultInfo,
  vaultAccessLabel,
} from "@repo/client";
import { canManageVault } from "@repo/schema";
import { Badge } from "@repo/ui/components/Badge";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { PencilLineIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import { DeleteVaultDialog, VaultDialog, VaultTile } from "@/features/vaults";

function itemCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

/**
 * The profile's vaults (ADR 0001 D6): create one, rename it or change its icon
 * and colour (owners and managers), delete it (owners; never the personal one).
 */
export default function VaultsSettingsPage() {
  const { vaults } = useVaults();
  const { records } = useGetRecords();
  const { canChangeVaults } = useVaultActions();
  const [createOpen, setCreateOpen] = useState(false);
  // The vault a dialog is for stays set while the dialog closes, so its content
  // doesn't change or empty during the exit animation.
  const [editing, setEditing] = useState<VaultInfo>();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<VaultInfo>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.vaultId, (counts.get(record.vaultId) ?? 0) + 1);

  return (
    <>
      <PanelHeader className="flex-row items-center justify-between">
        <PanelTitle>Vaults</PanelTitle>
        <Button variant="outline" disabled={!canChangeVaults} onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          New vault
        </Button>
      </PanelHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {!canChangeVaults && (
          <p className="text-muted-foreground text-sm">
            You're offline. Vaults change on the server, so connect to create, edit or delete one.
          </p>
        )}
        <ItemGroup>
          {vaults.map((vault) => {
            const access = vaultAccessLabel(vault);
            const canEdit = canChangeVaults && canManageVault(vault.role);
            const canDelete =
              canChangeVaults && vault.kind !== "personal" && vault.role === "owner";
            return (
              <Item key={vault.vaultId} variant="outline">
                <ItemMedia>
                  <VaultTile vault={vault} />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-1">
                  <ItemTitle className="flex items-center gap-2">
                    <span className="truncate">{vault.name}</span>
                    {access && <Badge variant="outline">{access}</Badge>}
                  </ItemTitle>
                  <ItemDescription>
                    {itemCount(counts.get(vault.vaultId) ?? 0)}
                    {vault.kind === "personal" &&
                      " · new items go here unless you pick another vault"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Edit ${vault.name}`}
                      onClick={() => {
                        setEditing(vault);
                        setEditOpen(true);
                      }}
                    >
                      <PencilLineIcon />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost-destructive"
                      size="icon"
                      aria-label={`Delete ${vault.name}`}
                      onClick={() => {
                        setDeleting(vault);
                        setDeleteOpen(true);
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </div>

      <VaultDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VaultDialog open={editOpen} vault={editing} onOpenChange={setEditOpen} />
      {deleting && (
        <DeleteVaultDialog vault={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
