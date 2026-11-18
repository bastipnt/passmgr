import {
  itemCount,
  SessionContext,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import {
  EllipsisIcon,
  KeyRoundIcon,
  PencilLineIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import {
  DeleteVaultDialog,
  RevokedVaults,
  RotateVaultKeyDialog,
  VaultDialog,
  VaultInvitations,
  VaultMembersDialog,
  VaultTile,
} from "@/features/vaults";
import CreateAccountDialog from "./CreateAccountDialog";
import { SecurityCodeCard } from "./SecurityCodeCard";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsRowButton } from "./SettingsRow";
import { type VaultAction, VaultActionsSheet } from "./VaultActionsSheet";

/**
 * A vault dialog's state. The vault stays set while the dialog closes, so its
 * content doesn't change or empty during the exit animation.
 */
function useVaultDialog() {
  const [vault, setVault] = useState<VaultInfo>();
  const [open, setOpen] = useState(false);
  const show = (next: VaultInfo) => {
    setVault(next);
    setOpen(true);
  };
  return { vault, open, setOpen, show };
}

/** Who the vault is for, after its item count: "only you", "you own it", "can edit". */
function vaultRelation(vault: VaultInfo, phone: boolean): string {
  if (vault.kind === "personal") return phone ? "default for new items" : "only you";
  return vaultAccessLabel(vault)?.toLowerCase() ?? "you own it";
}

/**
 * The profile's vaults (ADR 0001 D6): create one, rename it or change its icon
 * and colour or rotate its key (owners and managers), delete it (owners; never
 * the personal one). Shared vaults show their members (ADR 0001 D7): owners and
 * managers invite people there; a local profile needs an online account first.
 * Invites to other people's vaults and changes left over from a lost vault show
 * above the list. Desktop: Members + a ⋯ menu per row; phone: a row opens
 * `VaultActionsSheet`.
 */
export default function VaultsSettingsPage() {
  const { vaults } = useVaults();
  const { records } = useGetRecords();
  const { canChangeVaults } = useVaultActions();
  const { mode } = useContext(SessionContext);
  const isMobile = useIsMobile();
  const [createOpen, setCreateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const editDialog = useVaultDialog();
  const rotateDialog = useVaultDialog();
  const deleteDialog = useVaultDialog();
  const membersDialog = useVaultDialog();
  // By id, so the sheet follows a rename or a role change while it's open.
  const [sheetVaultId, setSheetVaultId] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetVault = vaults.find((vault) => vault.vaultId === sheetVaultId);

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.vaultId, (counts.get(record.vaultId) ?? 0) + 1);

  /** Members (or Share, for a local profile), then Edit, Rotate key and Delete. */
  const vaultActions = (vault: VaultInfo): VaultAction[] => {
    const actions: VaultAction[] = [];
    if (vault.kind === "shared")
      actions.push(
        mode === "local"
          ? {
              key: "members",
              label: "Share",
              ariaLabel: `Share ${vault.name}`,
              description: "Sharing needs an online account",
              icon: UsersIcon,
              run: () => setShareOpen(true),
            }
          : {
              key: "members",
              label: "Members",
              ariaLabel: `Members of ${vault.name}`,
              description: mode === "offline" ? "Connect to see members or share" : undefined,
              icon: UsersIcon,
              disabled: mode === "offline",
              run: () => membersDialog.show(vault),
            },
      );
    if (canChangeVaults && canManageVault(vault.role))
      actions.push(
        { key: "edit", label: "Edit", icon: PencilLineIcon, run: () => editDialog.show(vault) },
        {
          key: "rotate",
          label: "Rotate key",
          icon: KeyRoundIcon,
          run: () => rotateDialog.show(vault),
        },
      );
    if (canChangeVaults && vault.kind !== "personal" && vault.role === "owner")
      actions.push({
        key: "delete",
        label: "Delete",
        icon: TrashIcon,
        destructive: true,
        run: () => deleteDialog.show(vault),
      });
    return actions;
  };

  const newVault = (
    <Button
      disabled={!canChangeVaults}
      onClick={() => setCreateOpen(true)}
      className={isMobile ? "w-full" : undefined}
    >
      <PlusIcon />
      New vault
    </Button>
  );

  return (
    <SettingsPage
      title="Vaults"
      description="Keep items apart, and share a vault with the people who need it."
      action={isMobile ? undefined : newVault}
    >
      {!canChangeVaults && (
        <p className="text-muted-foreground text-sm">
          You're offline. Vaults change on the server, so connect to create, edit, delete or share
          one. Shared vaults stay usable meanwhile.
        </p>
      )}
      <VaultInvitations />
      <RevokedVaults />
      <SettingsGroup
        label="Your vaults"
        list
        footnote={
          isMobile
            ? "Tap a vault for Members, Edit, Rotate key and Delete."
            : "Edit, Rotate key and Delete are in each vault's ⋯ menu. Personal can't be shared or deleted."
        }
      >
        {vaults.map((vault) => {
          const hint = `${itemCount(counts.get(vault.vaultId) ?? 0)} · ${vaultRelation(vault, isMobile)}`;
          const actions = vaultActions(vault);
          const members = actions.find((action) => action.key === "members");
          const menu = actions.filter((action) => action !== members);
          if (isMobile)
            return (
              <li key={vault.vaultId}>
                {actions.some((action) => !action.disabled) ? (
                  <SettingsRowButton
                    media={<VaultTile vault={vault} />}
                    label={vault.name}
                    hint={hint}
                    chevron
                    onClick={() => {
                      setSheetVaultId(vault.vaultId);
                      setSheetOpen(true);
                    }}
                  />
                ) : (
                  <SettingsRow media={<VaultTile vault={vault} />} label={vault.name} hint={hint} />
                )}
              </li>
            );
          return (
            <li key={vault.vaultId}>
              <SettingsRow
                media={<VaultTile vault={vault} />}
                label={vault.name}
                hint={hint}
                control={
                  <>
                    {vault.kind === "personal" && (
                      <Badge variant="secondary">Default for new items</Badge>
                    )}
                    {members && (
                      <Button
                        variant="outline"
                        disabled={members.disabled}
                        title={members.description}
                        aria-label={members.ariaLabel}
                        onClick={members.run}
                      >
                        <UsersIcon />
                        {members.label}
                      </Button>
                    )}
                    {menu.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`More actions for ${vault.name}`}
                            >
                              <EllipsisIcon />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {menu.map((action) => (
                            <DropdownMenuItem
                              key={action.key}
                              variant={action.destructive ? "destructive" : undefined}
                              onClick={action.run}
                            >
                              <action.icon />
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                }
              />
            </li>
          );
        })}
      </SettingsGroup>
      {isMobile && newVault}
      {mode === "online" && <SecurityCodeCard />}

      <VaultDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VaultDialog
        open={editDialog.open}
        vault={editDialog.vault}
        onOpenChange={editDialog.setOpen}
      />
      {deleteDialog.vault && (
        <DeleteVaultDialog
          vault={deleteDialog.vault}
          open={deleteDialog.open}
          onOpenChange={deleteDialog.setOpen}
        />
      )}
      {rotateDialog.vault && (
        <RotateVaultKeyDialog
          vault={rotateDialog.vault}
          open={rotateDialog.open}
          onOpenChange={rotateDialog.setOpen}
        />
      )}
      {membersDialog.vault && (
        <VaultMembersDialog
          vault={membersDialog.vault}
          open={membersDialog.open}
          onOpenChange={membersDialog.setOpen}
        />
      )}
      {mode === "local" && <CreateAccountDialog open={shareOpen} onOpenChange={setShareOpen} />}
      {sheetVault && (
        <VaultActionsSheet
          vault={sheetVault}
          count={counts.get(sheetVault.vaultId) ?? 0}
          actions={vaultActions(sheetVault)}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </SettingsPage>
  );
}
